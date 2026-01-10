/**
 * Chunk Merge Module
 *
 * Stitches together chunk artifacts from conversations/{id}/chunks/* into
 * a single coherent conversation document. Handles:
 * - Segment deduplication in overlap regions
 * - Speaker ID canonicalization across chunks
 * - Term/topic/person merging with deterministic IDs
 * - Idempotency (safe to run multiple times)
 *
 * Triggered by Cloud Tasks after all chunks complete processing.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './index';
import {
  ChunkArtifact,
  Segment,
  Speaker,
  Term,
  TermOccurrence,
  Topic,
  Person,
  SpeakerSignature,
  ReconciliationDetails
} from './types';
import { getPreferredChunkForTimestamp, chunkToOriginalTimestamp } from './chunkBounds';
import { ChunkMetadata } from './chunking';
import { reconcileSpeakers, ReconciliationLowConfidenceError } from './speakerReconciliation';

/**
 * Merge all chunk artifacts for a conversation into the final document.
 *
 * Steps:
 * 1. Check idempotency (skip if already merged)
 * 2. Load all chunk artifacts
 * 3. Deduplicate segments using overlap boundaries
 * 4. Merge speakers, terms, topics, people
 * 5. Write final conversation document
 * 6. Update status to 'complete'
 *
 * @throws Error if chunks are missing or invalid
 */
export async function mergeChunks(conversationId: string): Promise<void> {
  console.log('[ChunkMerge] Starting merge process:', { conversationId });

  // Step 1: Check idempotency - if already merged, skip
  const conversationRef = db.collection('conversations').doc(conversationId);
  const conversationSnap = await conversationRef.get();

  if (!conversationSnap.exists) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const conversationData = conversationSnap.data()!;
  const chunkingMeta = conversationData.chunkingMetadata;

  if (!chunkingMeta) {
    throw new Error(`No chunking metadata for conversation ${conversationId}`);
  }

  // Idempotency check - if mergedAt is set, we're done
  if (chunkingMeta.mergedAt) {
    console.log('[ChunkMerge] Already merged, skipping:', {
      conversationId,
      mergedAt: chunkingMeta.mergedAt
    });
    return;
  }

  // Mark merge as started
  await conversationRef.update({
    'chunkingMetadata.mergeStartedAt': new Date().toISOString(),
    status: 'merging',
    updatedAt: FieldValue.serverTimestamp()
  });

  // Step 2: Load all chunk artifacts
  console.log('[ChunkMerge] Loading chunk artifacts...');
  const chunksSnap = await conversationRef
    .collection('chunks')
    .orderBy('chunkIndex')
    .get();

  if (chunksSnap.empty) {
    throw new Error(`No chunk artifacts found for conversation ${conversationId}`);
  }

  const chunkArtifacts: ChunkArtifact[] = chunksSnap.docs.map(doc => doc.data() as ChunkArtifact);

  // Validate we have all chunks
  const expectedChunks = chunkingMeta.totalChunks;
  if (chunkArtifacts.length !== expectedChunks) {
    throw new Error(
      `Missing chunks: expected ${expectedChunks}, found ${chunkArtifacts.length}`
    );
  }

  console.log('[ChunkMerge] Loaded chunk artifacts:', {
    conversationId,
    chunkCount: chunkArtifacts.length,
    totalSegments: chunkArtifacts.reduce((sum, c) => sum + c.segments.length, 0)
  });

  // Build chunk metadata array for deduplication helpers
  const chunkMetadataArray: ChunkMetadata[] = chunkArtifacts.map(artifact => ({
    chunkIndex: artifact.chunkIndex,
    totalChunks: artifact.totalChunks,
    startMs: artifact.chunkBounds.startMs,
    endMs: artifact.chunkBounds.endMs,
    overlapBeforeMs: artifact.chunkBounds.overlapBeforeMs,
    overlapAfterMs: artifact.chunkBounds.overlapAfterMs,
    chunkStoragePath: artifact.storagePath,
    originalStoragePath: chunkingMeta.originalStoragePath,
    durationMs: artifact.chunkBounds.endMs - artifact.chunkBounds.startMs +
                artifact.chunkBounds.overlapBeforeMs + artifact.chunkBounds.overlapAfterMs
  }));

  // Step 3: Run speaker reconciliation (parallel mode only)
  let reconciliationConfidence: number | undefined;
  let reconciliationDetails: ReconciliationDetails | undefined;
  const speakerIdRemapping = new Map<string, string>(); // originalId → canonicalId

  const processingMode = conversationData.processingMode || 'parallel';

  if (processingMode === 'parallel') {
    console.log('[ChunkMerge] Running speaker reconciliation (parallel mode)...');

    // Collect all speaker signatures from chunks
    const allSignatures: SpeakerSignature[] = [];
    for (const artifact of chunkArtifacts) {
      if (artifact.chunkSpeakerSignatures) {
        allSignatures.push(...artifact.chunkSpeakerSignatures);
      }
    }

    console.log('[ChunkMerge] Collected speaker signatures:', {
      totalSignatures: allSignatures.length,
      chunks: new Set(allSignatures.map(s => s.chunkIndex)).size
    });

    try {
      const reconciliationResult = reconcileSpeakers(allSignatures);

      // Store reconciliation metadata
      reconciliationConfidence = reconciliationResult.overallConfidence;
      reconciliationDetails = {
        clusterCount: reconciliationResult.clusterDetails.length,
        originalSpeakerCount: allSignatures.length,
        clusters: reconciliationResult.clusterDetails.map(c => ({
          canonicalId: c.canonicalId,
          originalIds: c.originalIds,
          confidence: c.confidence,
          displayName: c.displayName,
          matchEvidence: c.matchEvidence
        }))
      };

      // Build remapping table
      for (const [originalId, canonicalId] of reconciliationResult.speakerIdMap) {
        speakerIdRemapping.set(originalId, canonicalId);
      }

      console.log('[ChunkMerge] Speaker reconciliation complete:', {
        overallConfidence: reconciliationConfidence,
        totalClusters: reconciliationDetails.clusterCount,
        totalOriginalSpeakers: reconciliationDetails.originalSpeakerCount
      });

    } catch (error) {
      if (error instanceof ReconciliationLowConfidenceError) {
        // Low confidence reconciliation - throw error to fail merge
        console.error('[ChunkMerge] ❌ Speaker reconciliation confidence too low:', {
          confidence: error.overallConfidence,
          clusterCount: error.clusterDetails.length
        });
        throw error;
      }
      // Re-throw other errors
      throw error;
    }
  } else {
    console.log('[ChunkMerge] Skipping speaker reconciliation (sequential mode)');
  }

  // Step 4: Deduplicate segments using preferred chunk logic
  //
  // IMPORTANT: Segment timestamps from Gemini are chunk-local (start at 0 for each chunk).
  // We must convert them to the original audio timeline before checking which chunk "owns"
  // them for deduplication. Without this conversion, later chunks would have low timestamps
  // that make them appear to belong to earlier chunks, causing them to be dropped.
  console.log('[ChunkMerge] Deduplicating segments...');
  const mergedSegments: Segment[] = [];
  const seenSegmentIds = new Set<string>();

  for (const artifact of chunkArtifacts) {
    // Get the chunk metadata for timestamp conversion
    const chunkMeta = chunkMetadataArray[artifact.chunkIndex];

    for (const segment of artifact.segments) {
      // Convert chunk-local timestamp to original audio timeline
      const originalStartMs = chunkToOriginalTimestamp(segment.startMs, chunkMeta);
      const originalEndMs = chunkToOriginalTimestamp(segment.endMs, chunkMeta);

      // Check if this segment's original timestamp belongs to this chunk
      const preferredChunk = getPreferredChunkForTimestamp(originalStartMs, chunkMetadataArray);

      if (preferredChunk === artifact.chunkIndex) {
        // This chunk "owns" this segment - include it with normalized timestamps
        if (!seenSegmentIds.has(segment.segmentId)) {
          // Remap speaker ID if reconciliation was performed
          let speakerId = segment.speakerId;
          if (processingMode === 'parallel' && speakerIdRemapping.size > 0) {
            const originalId = `${segment.speakerId}_chunk${artifact.chunkIndex}`;
            const canonicalId = speakerIdRemapping.get(originalId);
            if (canonicalId) {
              speakerId = canonicalId;
            }
          }

          mergedSegments.push({
            ...segment,
            speakerId,
            startMs: originalStartMs,
            endMs: originalEndMs
          });
          seenSegmentIds.add(segment.segmentId);
        }
      }
      // Otherwise, skip (will be included from the preferred chunk)
    }
  }

  // Sort segments by index to ensure correct order
  mergedSegments.sort((a, b) => a.index - b.index);

  // Reindex segments to be sequential (since we may have dropped duplicates)
  mergedSegments.forEach((seg, idx) => {
    seg.index = idx;
  });

  console.log('[ChunkMerge] Segment deduplication complete:', {
    totalBeforeDedup: chunkArtifacts.reduce((sum, c) => sum + c.segments.length, 0),
    totalAfterDedup: mergedSegments.length,
    duplicatesRemoved: chunkArtifacts.reduce((sum, c) => sum + c.segments.length, 0) - mergedSegments.length
  });

  // Step 5: Merge speakers
  console.log('[ChunkMerge] Merging speakers...');
  const mergedSpeakers: Record<string, Speaker> = {};

  if (processingMode === 'parallel' && reconciliationDetails) {
    // Use reconciliation results to build canonical speaker map
    for (const cluster of reconciliationDetails.clusters) {
      mergedSpeakers[cluster.canonicalId] = {
        speakerId: cluster.canonicalId,
        displayName: cluster.displayName,
        colorIndex: Object.keys(mergedSpeakers).length % 10 // Assign color index
      };
    }
  } else {
    // Sequential mode: simple union (speaker IDs should be consistent)
    for (const artifact of chunkArtifacts) {
      for (const [speakerId, speaker] of Object.entries(artifact.speakers)) {
        if (!mergedSpeakers[speakerId]) {
          mergedSpeakers[speakerId] = speaker;
        }
        // If speaker already exists, prefer the one with a display name
        else if (speaker.displayName && !mergedSpeakers[speakerId].displayName) {
          mergedSpeakers[speakerId] = speaker;
        }
      }
    }
  }

  // Step 6: Merge terms (deduplicate by termId)
  console.log('[ChunkMerge] Merging terms...');
  const mergedTerms: Record<string, Term> = {};
  const mergedTermOccurrences: TermOccurrence[] = [];
  const seenOccurrenceIds = new Set<string>();

  for (const artifact of chunkArtifacts) {
    // Merge terms
    for (const [termId, term] of Object.entries(artifact.terms)) {
      if (!mergedTerms[termId]) {
        mergedTerms[termId] = term;
      }
    }

    // Merge term occurrences (only for segments we kept)
    for (const occurrence of artifact.termOccurrences) {
      // Only include if the segment was kept after deduplication
      if (seenSegmentIds.has(occurrence.segmentId) && !seenOccurrenceIds.has(occurrence.occurrenceId)) {
        mergedTermOccurrences.push(occurrence);
        seenOccurrenceIds.add(occurrence.occurrenceId);
      }
    }
  }

  // Step 7: Merge topics (deduplicate by topicId, adjust indices)
  console.log('[ChunkMerge] Merging topics...');
  const mergedTopics: Topic[] = [];
  const seenTopicIds = new Set<string>();

  for (const artifact of chunkArtifacts) {
    for (const topic of artifact.topics) {
      if (!seenTopicIds.has(topic.topicId)) {
        mergedTopics.push(topic);
        seenTopicIds.add(topic.topicId);
      }
    }
  }

  // Sort topics by start index
  mergedTopics.sort((a, b) => a.startIndex - b.startIndex);

  // Step 8: Merge people (deduplicate by personId)
  console.log('[ChunkMerge] Merging people...');
  const mergedPeople: Person[] = [];
  const seenPersonIds = new Set<string>();

  for (const artifact of chunkArtifacts) {
    for (const person of artifact.people) {
      if (!seenPersonIds.has(person.personId)) {
        mergedPeople.push(person);
        seenPersonIds.add(person.personId);
      }
    }
  }

  // Step 9: Calculate total duration from last segment
  const lastSegment = mergedSegments[mergedSegments.length - 1];
  const durationMs = lastSegment ? lastSegment.endMs : chunkingMeta.originalDurationMs;

  // Step 10: Write final merged data to conversation document
  console.log('[ChunkMerge] Writing final merged data...');
  const updateData: any = {
    segments: mergedSegments,
    speakers: mergedSpeakers,
    terms: mergedTerms,
    termOccurrences: mergedTermOccurrences,
    topics: mergedTopics,
    people: mergedPeople,
    durationMs,
    status: 'complete',
    'chunkingMetadata.mergedAt': new Date().toISOString(),
    alignmentStatus: 'aligned', // Chunks use WhisperX alignment
    updatedAt: FieldValue.serverTimestamp()
  };

  // Add reconciliation metadata if parallel mode
  if (processingMode === 'parallel' && reconciliationConfidence !== undefined) {
    updateData.reconciliationConfidence = reconciliationConfidence;
    updateData.reconciliationDetails = reconciliationDetails;
  }

  await conversationRef.update(updateData);

  console.log('[ChunkMerge] ✅ Merge complete:', {
    conversationId,
    finalCounts: {
      segments: mergedSegments.length,
      speakers: Object.keys(mergedSpeakers).length,
      terms: Object.keys(mergedTerms).length,
      termOccurrences: mergedTermOccurrences.length,
      topics: mergedTopics.length,
      people: mergedPeople.length
    },
    durationMs
  });
}

/**
 * Cloud Tasks HTTP handler for processing merge jobs.
 *
 * Security: Only accepts requests from Cloud Tasks (x-cloudtasks-taskname header).
 * Returns 200 on success (Cloud Tasks won't retry).
 * Returns 500 on failure (Cloud Tasks will retry with backoff).
 */
export const processMerge = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 600, // 10 minutes (merge can be slow for large files)
    region: 'us-central1',
    invoker: 'private' // Only Cloud Tasks can call this
  },
  async (req, res) => {
    // Validate Cloud Tasks header (security check)
    const taskName = req.headers['x-cloudtasks-taskname'];
    if (!taskName && process.env.K_SERVICE) { // K_SERVICE is set in Cloud Run
      console.error('[ProcessMerge] Forbidden: Direct invocation not allowed');
      res.status(403).send('Forbidden: Direct invocation not allowed');
      return;
    }

    console.log('[ProcessMerge] Task started:', {
      taskName,
      timestamp: new Date().toISOString()
    });

    // Parse request payload
    let conversationId: string;
    try {
      const payload = req.body as { conversationId: string };

      if (!payload.conversationId) {
        throw new Error('Missing required field: conversationId');
      }

      conversationId = payload.conversationId;

      console.log('[ProcessMerge] Processing merge:', { conversationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid request payload';
      console.error('[ProcessMerge] Invalid payload:', errorMessage);
      res.status(400).send(`Bad Request: ${errorMessage}`);
      return;
    }

    try {
      // Execute merge
      await mergeChunks(conversationId);

      console.log('[ProcessMerge] ✅ Task completed successfully:', { conversationId });
      res.status(200).send('OK');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[ProcessMerge] ❌ Task failed:', {
        conversationId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      // Update Firestore to mark merge failed
      try {
        await db.collection('conversations').doc(conversationId).update({
          status: 'failed',
          processingError: `Merge failed: ${errorMessage}`,
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (updateError) {
        console.error('[ProcessMerge] Failed to update Firestore status:', updateError);
      }

      // Return 500 so Cloud Tasks will retry
      res.status(500).send(`Internal Server Error: ${errorMessage}`);
    }
  }
);
