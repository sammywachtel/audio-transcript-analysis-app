/**
 * Chunk Context Management Module
 *
 * Handles reading/writing ChunkContext and ChunkStatus atomically using
 * Firestore transactions. This is critical because multiple chunk tasks
 * may run concurrently and race conditions could corrupt state.
 *
 * The chunk context enables:
 * 1. Speaker identity continuity across chunk boundaries
 * 2. Deduplication of terms/topics/people across chunks
 * 3. Resumable execution (failed chunks can retry with correct state)
 */

import { db } from './index';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import {
  ChunkContext,
  ChunkStatus,
  ChunkProcessingStatus,
  ChunkingMetadata,
  SpeakerMapping
} from './types';

// Maximum summary length to prevent unbounded growth
const MAX_SUMMARY_LENGTH = 512;

// =============================================================================
// Context Creation
// =============================================================================

/**
 * Create an empty initial context for the first chunk.
 * This is the "seed" state before any processing.
 */
export function createInitialContext(): ChunkContext {
  return {
    emittedByChunkIndex: -1, // Indicates this is the initial seed, not emitted by a real chunk
    speakerMap: [],
    previousSummary: '',
    knownTermIds: [],
    knownTopicIds: [],
    knownPersonIds: [],
    cumulativeSegmentCount: 0,
    lastProcessedMs: 0
  };
}

/**
 * Create initial chunk statuses for a set of chunks.
 * All chunks start as 'pending'.
 */
export function createInitialChunkStatuses(totalChunks: number): ChunkStatus[] {
  return Array.from({ length: totalChunks }, (_, i) => ({
    chunkIndex: i,
    status: 'pending' as ChunkProcessingStatus,
    retryCount: 0
  }));
}

// =============================================================================
// Context Reading
// =============================================================================

/**
 * Load the chunk context for a specific chunk index.
 *
 * For chunk 0, returns the initial empty context.
 * For chunk N (N > 0), returns the context emitted by chunk N-1.
 *
 * Uses a transaction to ensure consistent read with potential updates.
 *
 * @throws Error if previous chunk context is missing (indicates incomplete processing)
 */
export async function loadChunkContext(
  conversationId: string,
  chunkIndex: number
): Promise<ChunkContext> {
  const docRef = db.collection('conversations').doc(conversationId);

  return db.runTransaction(async (transaction: Transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const data = doc.data();
    const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

    // For the first chunk, return initial context
    if (chunkIndex === 0) {
      console.log('[ChunkContext] First chunk - using initial empty context');
      return createInitialContext();
    }

    // For subsequent chunks, we need the context from the previous chunk
    const previousChunkIndex = chunkIndex - 1;

    if (!chunkingMeta?.chunkContexts) {
      throw new Error(`No chunk contexts found for conversation ${conversationId}`);
    }

    const previousContext = chunkingMeta.chunkContexts.find(
      ctx => ctx.emittedByChunkIndex === previousChunkIndex
    );

    if (!previousContext) {
      // Check if previous chunk is still processing or failed
      const previousStatus = chunkingMeta.chunkStatuses?.find(
        s => s.chunkIndex === previousChunkIndex
      );

      if (previousStatus?.status === 'processing') {
        throw new Error(
          `Chunk ${chunkIndex} waiting on chunk ${previousChunkIndex} which is still processing`
        );
      } else if (previousStatus?.status === 'failed') {
        throw new Error(
          `Chunk ${chunkIndex} cannot proceed - previous chunk ${previousChunkIndex} failed: ${previousStatus.error}`
        );
      } else if (previousStatus?.status === 'pending') {
        throw new Error(
          `Chunk ${chunkIndex} cannot proceed - previous chunk ${previousChunkIndex} is still pending`
        );
      }

      throw new Error(
        `Context from chunk ${previousChunkIndex} not found for conversation ${conversationId}`
      );
    }

    console.log('[ChunkContext] Loaded context from previous chunk:', {
      conversationId,
      chunkIndex,
      previousChunkIndex,
      speakerCount: previousContext.speakerMap.length,
      cumulativeSegments: previousContext.cumulativeSegmentCount
    });

    return previousContext;
  });
}

// =============================================================================
// Status Updates
// =============================================================================

/**
 * Mark a chunk as "processing" atomically.
 * Updates the chunk status and increments retry count if this is a retry.
 *
 * Uses transaction to prevent race conditions between concurrent chunk tasks.
 */
export async function markChunkProcessing(
  conversationId: string,
  chunkIndex: number
): Promise<void> {
  const docRef = db.collection('conversations').doc(conversationId);

  await db.runTransaction(async (transaction: Transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const data = doc.data();
    const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

    if (!chunkingMeta) {
      throw new Error(`No chunking metadata for conversation ${conversationId}`);
    }

    // Find and update the chunk status
    const statuses = [...chunkingMeta.chunkStatuses];
    const statusIndex = statuses.findIndex(s => s.chunkIndex === chunkIndex);

    if (statusIndex === -1) {
      throw new Error(`Chunk ${chunkIndex} not found in statuses for ${conversationId}`);
    }

    const currentStatus = statuses[statusIndex];

    // Increment retry count if this was previously failed or processing
    const isRetry = currentStatus.status === 'failed' || currentStatus.status === 'processing';

    statuses[statusIndex] = {
      ...currentStatus,
      status: 'processing',
      startedAt: new Date().toISOString(),
      error: undefined, // Clear previous error
      retryCount: isRetry ? (currentStatus.retryCount || 0) + 1 : currentStatus.retryCount || 0
    };

    transaction.update(docRef, {
      'chunkingMetadata.chunkStatuses': statuses,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log('[ChunkContext] Marked chunk as processing:', {
      conversationId,
      chunkIndex,
      isRetry,
      retryCount: statuses[statusIndex].retryCount
    });
  });
}

/**
 * Result from markChunkComplete indicating if merge should be triggered.
 */
export interface ChunkCompleteResult {
  /** Whether all chunks are now complete */
  allComplete: boolean;
  /** Whether a merge task should be enqueued */
  shouldEnqueueMerge: boolean;
}

/**
 * Mark a chunk as completed and save its emitted context.
 *
 * This is the critical operation for context propagation - it:
 * 1. Updates the chunk status to 'complete'
 * 2. Stores the context this chunk emitted for the next chunk
 * 3. Increments the completedChunks counter
 * 4. Checks if all chunks are complete and merge should be triggered
 *
 * Uses transaction to ensure atomicity and prevent duplicate merge enqueuing.
 *
 * @returns Result indicating if merge task should be enqueued
 */
export async function markChunkComplete(
  conversationId: string,
  chunkIndex: number,
  emittedContext: ChunkContext
): Promise<ChunkCompleteResult> {
  const docRef = db.collection('conversations').doc(conversationId);

  return db.runTransaction(async (transaction: Transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const data = doc.data();
    const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

    if (!chunkingMeta) {
      throw new Error(`No chunking metadata for conversation ${conversationId}`);
    }

    // Update chunk status
    const statuses = [...chunkingMeta.chunkStatuses];
    const statusIndex = statuses.findIndex(s => s.chunkIndex === chunkIndex);

    if (statusIndex === -1) {
      throw new Error(`Chunk ${chunkIndex} not found in statuses`);
    }

    statuses[statusIndex] = {
      ...statuses[statusIndex],
      status: 'complete',
      completedAt: new Date().toISOString()
    };

    // Add context to the contexts array
    // First, filter out any existing context from this chunk (in case of retry)
    const contexts = chunkingMeta.chunkContexts.filter(
      ctx => ctx.emittedByChunkIndex !== chunkIndex
    );
    contexts.push(emittedContext);

    // Sort by chunk index for easier debugging
    contexts.sort((a, b) => a.emittedByChunkIndex - b.emittedByChunkIndex);

    // Calculate completed count
    const completedCount = statuses.filter(s => s.status === 'complete').length;
    const allComplete = completedCount === chunkingMeta.totalChunks;

    // Check if we should enqueue merge task (all complete AND not already enqueued)
    const shouldEnqueueMerge = allComplete && !chunkingMeta.mergeTaskEnqueued;

    // Build update object
    const updates: Record<string, unknown> = {
      'chunkingMetadata.chunkStatuses': statuses,
      'chunkingMetadata.chunkContexts': contexts,
      'chunkingMetadata.completedChunks': completedCount,
      updatedAt: FieldValue.serverTimestamp()
    };

    // If we're triggering merge, set the guard flag atomically
    if (shouldEnqueueMerge) {
      updates['chunkingMetadata.mergeTaskEnqueued'] = true;
      updates['chunkingMetadata.mergeEnqueuedAt'] = new Date().toISOString();
    }

    transaction.update(docRef, updates);

    console.log('[ChunkContext] Marked chunk complete:', {
      conversationId,
      chunkIndex,
      completedCount,
      totalChunks: chunkingMeta.totalChunks,
      allComplete,
      shouldEnqueueMerge
    });

    return { allComplete, shouldEnqueueMerge };
  });
}

/**
 * Mark a chunk as failed with error details.
 *
 * This allows the resume logic to identify failed chunks for retry.
 */
export async function markChunkFailed(
  conversationId: string,
  chunkIndex: number,
  error: string
): Promise<void> {
  const docRef = db.collection('conversations').doc(conversationId);

  await db.runTransaction(async (transaction: Transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const data = doc.data();
    const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

    if (!chunkingMeta) {
      throw new Error(`No chunking metadata for conversation ${conversationId}`);
    }

    const statuses = [...chunkingMeta.chunkStatuses];
    const statusIndex = statuses.findIndex(s => s.chunkIndex === chunkIndex);

    if (statusIndex === -1) {
      throw new Error(`Chunk ${chunkIndex} not found in statuses`);
    }

    statuses[statusIndex] = {
      ...statuses[statusIndex],
      status: 'failed',
      completedAt: new Date().toISOString(),
      error
    };

    transaction.update(docRef, {
      'chunkingMetadata.chunkStatuses': statuses,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log('[ChunkContext] Marked chunk failed:', {
      conversationId,
      chunkIndex,
      error: error.substring(0, 200) // Truncate for logging
    });
  });
}

// =============================================================================
// Resume Logic
// =============================================================================

/**
 * Get chunks that need processing (pending or failed).
 *
 * Used by resume logic to determine which chunk tasks to re-enqueue.
 * Returns chunks sorted by index to maintain processing order.
 */
export async function getResumableChunks(
  conversationId: string
): Promise<{ pending: number[]; failed: number[]; processing: number[] }> {
  const doc = await db.collection('conversations').doc(conversationId).get();

  if (!doc.exists) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const data = doc.data();
  const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

  if (!chunkingMeta) {
    return { pending: [], failed: [], processing: [] };
  }

  const pending: number[] = [];
  const failed: number[] = [];
  const processing: number[] = [];

  for (const status of chunkingMeta.chunkStatuses) {
    switch (status.status) {
      case 'pending':
        pending.push(status.chunkIndex);
        break;
      case 'failed':
        failed.push(status.chunkIndex);
        break;
      case 'processing':
        processing.push(status.chunkIndex);
        break;
    }
  }

  // Sort for predictable ordering
  pending.sort((a, b) => a - b);
  failed.sort((a, b) => a - b);
  processing.sort((a, b) => a - b);

  console.log('[ChunkContext] Resumable chunks:', {
    conversationId,
    pending,
    failed,
    processing
  });

  return { pending, failed, processing };
}

/**
 * Check if all chunks are complete.
 */
export async function isAllChunksComplete(conversationId: string): Promise<boolean> {
  const doc = await db.collection('conversations').doc(conversationId).get();

  if (!doc.exists) {
    return false;
  }

  const data = doc.data();
  const chunkingMeta = data?.chunkingMetadata as ChunkingMetadata | undefined;

  if (!chunkingMeta) {
    return false;
  }

  return chunkingMeta.completedChunks === chunkingMeta.totalChunks;
}

// =============================================================================
// Context Building Helpers
// =============================================================================

/**
 * Sanitize and truncate a summary string.
 * Removes any potentially sensitive content and caps length.
 */
export function sanitizeSummary(summary: string): string {
  // Remove potential secrets (API keys, tokens, etc.)
  const sanitized = summary
    .replace(/\b[A-Za-z0-9]{32,}\b/g, '[REDACTED]') // Long alphanumeric strings
    .replace(/sk-[A-Za-z0-9]+/g, '[REDACTED]') // API key patterns
    .replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '[REDACTED]');

  // Truncate to max length, ending at a word boundary if possible
  if (sanitized.length <= MAX_SUMMARY_LENGTH) {
    return sanitized;
  }

  const truncated = sanitized.substring(0, MAX_SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > MAX_SUMMARY_LENGTH * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Merge speaker mappings from current chunk into existing map.
 *
 * When a new chunk discovers speakers, we need to either:
 * 1. Map them to existing canonical IDs (if they match known speakers)
 * 2. Create new canonical IDs (if they're new speakers)
 *
 * This is a simplified implementation - real speaker matching would use
 * voice embeddings. For now, we just preserve the mappings as-is.
 */
export function mergeSpeakerMappings(
  existing: SpeakerMapping[],
  newMappings: SpeakerMapping[]
): SpeakerMapping[] {
  const merged = [...existing];

  for (const newMapping of newMappings) {
    // Check if we already have a mapping for this original ID
    const existingIndex = merged.findIndex(m => m.originalId === newMapping.originalId);

    if (existingIndex === -1) {
      merged.push(newMapping);
    } else {
      // Update with any new information (e.g., display name discovered later)
      merged[existingIndex] = {
        ...merged[existingIndex],
        displayName: newMapping.displayName || merged[existingIndex].displayName,
        voiceSignature: newMapping.voiceSignature || merged[existingIndex].voiceSignature
      };
    }
  }

  return merged;
}

/**
 * Build the next context from current processing results.
 *
 * Call this at the end of chunk processing to create the context
 * that will be passed to the next chunk.
 */
export function buildNextContext(
  previousContext: ChunkContext,
  chunkIndex: number,
  params: {
    speakerMappings: SpeakerMapping[];
    chunkSummary: string;
    newTermIds: string[];
    newTopicIds: string[];
    newPersonIds: string[];
    segmentsProcessed: number;
    lastTimestampMs: number;
  }
): ChunkContext {
  return {
    emittedByChunkIndex: chunkIndex,
    speakerMap: mergeSpeakerMappings(previousContext.speakerMap, params.speakerMappings),
    previousSummary: sanitizeSummary(
      previousContext.previousSummary
        ? `${previousContext.previousSummary} | ${params.chunkSummary}`
        : params.chunkSummary
    ),
    knownTermIds: [...new Set([...previousContext.knownTermIds, ...params.newTermIds])],
    knownTopicIds: [...new Set([...previousContext.knownTopicIds, ...params.newTopicIds])],
    knownPersonIds: [...new Set([...previousContext.knownPersonIds, ...params.newPersonIds])],
    cumulativeSegmentCount: previousContext.cumulativeSegmentCount + params.segmentsProcessed,
    lastProcessedMs: params.lastTimestampMs
  };
}
