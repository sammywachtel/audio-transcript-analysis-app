/**
 * Chunk Boundary Validation & Utilities
 *
 * Helper functions for validating chunk metadata and calculating
 * overlap regions for downstream deduplication.
 *
 * These utilities ensure chunk metadata is consistent and provide
 * the foundation for the merge layer (Scope 5c) to correctly
 * stitch transcripts back together.
 */

import { ChunkMetadata, CHUNK_CONFIG } from './chunking';

// =============================================================================
// Types
// =============================================================================

/**
 * Validation result with detailed error information.
 */
export interface ChunkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Overlap region between two consecutive chunks.
 * Used by merge layer to identify duplicate content.
 */
export interface OverlapRegion {
  /** Index of the earlier chunk */
  chunkIndexA: number;
  /** Index of the later chunk */
  chunkIndexB: number;
  /** Start time of overlap in original audio (milliseconds) */
  overlapStartMs: number;
  /** End time of overlap in original audio (milliseconds) */
  overlapEndMs: number;
  /** Duration of overlap (milliseconds) */
  overlapDurationMs: number;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a single chunk's metadata for consistency.
 *
 * Checks:
 * - Required fields are present
 * - Duration is within acceptable range
 * - Overlap values are reasonable
 * - Timestamps are logical (end > start)
 *
 * @param chunk - Chunk metadata to validate
 * @returns Validation result with any errors/warnings
 */
export function validateChunk(chunk: ChunkMetadata): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field checks
  if (chunk.chunkIndex === undefined || chunk.chunkIndex < 0) {
    errors.push(`Invalid chunkIndex: ${chunk.chunkIndex}`);
  }

  if (chunk.totalChunks === undefined || chunk.totalChunks < 1) {
    errors.push(`Invalid totalChunks: ${chunk.totalChunks}`);
  }

  if (chunk.chunkIndex >= chunk.totalChunks) {
    errors.push(`chunkIndex (${chunk.chunkIndex}) >= totalChunks (${chunk.totalChunks})`);
  }

  // Timestamp sanity
  if (chunk.startMs < 0) {
    errors.push(`startMs cannot be negative: ${chunk.startMs}`);
  }

  if (chunk.endMs <= chunk.startMs) {
    errors.push(`endMs (${chunk.endMs}) must be greater than startMs (${chunk.startMs})`);
  }

  // Duration checks
  const logicalDuration = chunk.endMs - chunk.startMs;
  const minDurationMs = CHUNK_CONFIG.MIN_DURATION_SECONDS * 1000;
  const maxDurationMs = CHUNK_CONFIG.MAX_DURATION_SECONDS * 1000 * 1.5; // Allow some flex

  if (logicalDuration < minDurationMs && chunk.totalChunks > 1) {
    // Only warn for multi-chunk files - single chunk can be any length
    warnings.push(`Chunk ${chunk.chunkIndex} duration (${logicalDuration}ms) below minimum (${minDurationMs}ms)`);
  }

  if (logicalDuration > maxDurationMs) {
    warnings.push(`Chunk ${chunk.chunkIndex} duration (${logicalDuration}ms) exceeds maximum (${maxDurationMs}ms)`);
  }

  // Overlap sanity
  if (chunk.overlapBeforeMs < 0) {
    errors.push(`overlapBeforeMs cannot be negative: ${chunk.overlapBeforeMs}`);
  }

  if (chunk.overlapAfterMs < 0) {
    errors.push(`overlapAfterMs cannot be negative: ${chunk.overlapAfterMs}`);
  }

  // First chunk shouldn't have overlapBefore
  if (chunk.chunkIndex === 0 && chunk.overlapBeforeMs !== 0) {
    warnings.push(`First chunk has overlapBeforeMs (${chunk.overlapBeforeMs}) but should be 0`);
  }

  // Last chunk shouldn't have overlapAfter
  if (chunk.chunkIndex === chunk.totalChunks - 1 && chunk.overlapAfterMs !== 0) {
    warnings.push(`Last chunk has overlapAfterMs (${chunk.overlapAfterMs}) but should be 0`);
  }

  // Storage path checks
  if (!chunk.originalStoragePath) {
    errors.push('originalStoragePath is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an array of chunks for a single audio file.
 *
 * Checks cross-chunk consistency:
 * - Chunks are contiguous (no gaps, no overlaps in logical time)
 * - All chunks reference the same original file
 * - Indices are sequential
 *
 * @param chunks - Array of chunk metadata to validate
 * @returns Validation result with any errors/warnings
 */
export function validateChunkSequence(chunks: ChunkMetadata[]): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (chunks.length === 0) {
    errors.push('Empty chunk sequence');
    return { valid: false, errors, warnings };
  }

  // Validate each chunk individually first
  for (const chunk of chunks) {
    const result = validateChunk(chunk);
    errors.push(...result.errors.map(e => `Chunk ${chunk.chunkIndex}: ${e}`));
    warnings.push(...result.warnings.map(w => `Chunk ${chunk.chunkIndex}: ${w}`));
  }

  // Check sequence consistency
  const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

  // All should have same totalChunks
  const totalCounts = new Set(chunks.map(c => c.totalChunks));
  if (totalCounts.size > 1) {
    errors.push(`Inconsistent totalChunks values: ${[...totalCounts].join(', ')}`);
  }

  // All should reference same original file
  const originalPaths = new Set(chunks.map(c => c.originalStoragePath));
  if (originalPaths.size > 1) {
    errors.push(`Inconsistent originalStoragePath values: ${[...originalPaths].join(', ')}`);
  }

  // Check indices are sequential (0, 1, 2, ...)
  for (let i = 0; i < sortedChunks.length; i++) {
    if (sortedChunks[i].chunkIndex !== i) {
      errors.push(`Missing or duplicate chunkIndex: expected ${i}, found ${sortedChunks[i].chunkIndex}`);
    }
  }

  // Check contiguity - each chunk should start where the previous ended
  for (let i = 1; i < sortedChunks.length; i++) {
    const prev = sortedChunks[i - 1];
    const curr = sortedChunks[i];

    // Allow small tolerance for rounding
    const gap = curr.startMs - prev.endMs;
    if (Math.abs(gap) > 100) { // More than 100ms gap/overlap
      warnings.push(`Gap between chunk ${prev.chunkIndex} and ${curr.chunkIndex}: ${gap}ms`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Overlap Calculation
// =============================================================================

/**
 * Calculate overlap regions between consecutive chunks.
 *
 * Returns the time ranges where audio content is duplicated across chunks.
 * The merge layer uses this to deduplicate transcripts.
 *
 * @param chunks - Array of chunk metadata
 * @returns Array of overlap regions between consecutive chunks
 */
export function calculateOverlapRegions(chunks: ChunkMetadata[]): OverlapRegion[] {
  if (chunks.length <= 1) {
    return [];
  }

  const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const regions: OverlapRegion[] = [];

  for (let i = 0; i < sortedChunks.length - 1; i++) {
    const chunkA = sortedChunks[i];
    const chunkB = sortedChunks[i + 1];

    // The effective overlap is the minimum of what each chunk provides
    // chunkA extends forward by overlapAfterMs, chunkB extends back by overlapBeforeMs
    const effectiveOverlapMs = Math.max(0, Math.min(chunkA.overlapAfterMs, chunkB.overlapBeforeMs));

    if (effectiveOverlapMs > 0) {
      // Overlap starts at chunkA's logical end (the boundary point)
      // and extends by the effective overlap duration
      regions.push({
        chunkIndexA: chunkA.chunkIndex,
        chunkIndexB: chunkB.chunkIndex,
        overlapStartMs: chunkA.endMs,
        overlapEndMs: chunkA.endMs + effectiveOverlapMs,
        overlapDurationMs: effectiveOverlapMs,
      });
    }
  }

  return regions;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a timestamp falls within a chunk's logical range.
 *
 * @param timestampMs - Timestamp to check (milliseconds)
 * @param chunk - Chunk metadata
 * @returns True if timestamp is within chunk's logical range
 */
export function isTimestampInChunk(timestampMs: number, chunk: ChunkMetadata): boolean {
  return timestampMs >= chunk.startMs && timestampMs < chunk.endMs;
}

/**
 * Check if a timestamp falls within a chunk's overlap region with the previous chunk.
 *
 * @param timestampMs - Timestamp to check (milliseconds)
 * @param chunk - Chunk metadata
 * @returns True if timestamp is in the overlap-before region
 */
export function isTimestampInOverlapBefore(timestampMs: number, chunk: ChunkMetadata): boolean {
  if (chunk.overlapBeforeMs === 0) return false;
  const overlapStart = chunk.startMs - chunk.overlapBeforeMs;
  return timestampMs >= overlapStart && timestampMs < chunk.startMs;
}

/**
 * Check if a timestamp falls within a chunk's overlap region with the next chunk.
 *
 * @param timestampMs - Timestamp to check (milliseconds)
 * @param chunk - Chunk metadata
 * @returns True if timestamp is in the overlap-after region
 */
export function isTimestampInOverlapAfter(timestampMs: number, chunk: ChunkMetadata): boolean {
  if (chunk.overlapAfterMs === 0) return false;
  const overlapEnd = chunk.endMs + chunk.overlapAfterMs;
  return timestampMs >= chunk.endMs && timestampMs < overlapEnd;
}

/**
 * Convert a timestamp from chunk-local time to original audio time.
 *
 * When processing a chunk, timestamps are relative to the chunk's start.
 * This function converts them back to the original audio timeline.
 *
 * @param localTimestampMs - Timestamp within the chunk (milliseconds)
 * @param chunk - Chunk metadata
 * @returns Timestamp in original audio timeline (milliseconds)
 */
export function chunkToOriginalTimestamp(localTimestampMs: number, chunk: ChunkMetadata): number {
  // The chunk's actual audio starts at (startMs - overlapBeforeMs)
  const chunkAudioStartMs = chunk.startMs - chunk.overlapBeforeMs;
  return chunkAudioStartMs + localTimestampMs;
}

/**
 * Convert a timestamp from original audio time to chunk-local time.
 *
 * @param originalTimestampMs - Timestamp in original audio (milliseconds)
 * @param chunk - Chunk metadata
 * @returns Timestamp within the chunk (milliseconds), or null if not in chunk
 */
export function originalToChunkTimestamp(originalTimestampMs: number, chunk: ChunkMetadata): number | null {
  const chunkAudioStartMs = chunk.startMs - chunk.overlapBeforeMs;
  const chunkAudioEndMs = chunk.endMs + chunk.overlapAfterMs;

  if (originalTimestampMs < chunkAudioStartMs || originalTimestampMs >= chunkAudioEndMs) {
    return null;
  }

  return originalTimestampMs - chunkAudioStartMs;
}

/**
 * Find which chunk(s) contain a given timestamp.
 *
 * A timestamp may appear in multiple chunks if it falls within an overlap region.
 *
 * @param originalTimestampMs - Timestamp in original audio (milliseconds)
 * @param chunks - Array of chunk metadata
 * @returns Array of chunk indices that contain this timestamp
 */
export function findChunksContainingTimestamp(originalTimestampMs: number, chunks: ChunkMetadata[]): number[] {
  return chunks
    .filter(chunk => {
      const chunkAudioStartMs = chunk.startMs - chunk.overlapBeforeMs;
      const chunkAudioEndMs = chunk.endMs + chunk.overlapAfterMs;
      return originalTimestampMs >= chunkAudioStartMs && originalTimestampMs < chunkAudioEndMs;
    })
    .map(chunk => chunk.chunkIndex);
}

/**
 * Get the preferred chunk for a timestamp when it appears in overlap.
 *
 * For consistent deduplication, we prefer the LATER chunk when a timestamp
 * appears in an overlap region. This ensures each segment is attributed
 * to exactly one chunk during merge.
 *
 * @param originalTimestampMs - Timestamp in original audio (milliseconds)
 * @param chunks - Array of chunk metadata
 * @returns Preferred chunk index, or null if timestamp not in any chunk
 */
export function getPreferredChunkForTimestamp(originalTimestampMs: number, chunks: ChunkMetadata[]): number | null {
  const containingChunks = findChunksContainingTimestamp(originalTimestampMs, chunks);

  if (containingChunks.length === 0) return null;
  if (containingChunks.length === 1) return containingChunks[0];

  // Multiple chunks contain this timestamp (overlap region)
  // Prefer the later chunk (higher index) for consistent attribution
  return Math.max(...containingChunks);
}

/**
 * Summary statistics for a chunk sequence.
 */
export interface ChunkSequenceStats {
  totalChunks: number;
  originalDurationMs: number;
  averageChunkDurationMs: number;
  totalOverlapMs: number;
  overlapPercentage: number;
}

/**
 * Calculate summary statistics for a chunk sequence.
 *
 * @param chunks - Array of chunk metadata
 * @returns Summary statistics
 */
export function getChunkSequenceStats(chunks: ChunkMetadata[]): ChunkSequenceStats {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      originalDurationMs: 0,
      averageChunkDurationMs: 0,
      totalOverlapMs: 0,
      overlapPercentage: 0,
    };
  }

  const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const lastChunk = sortedChunks[sortedChunks.length - 1];
  const originalDurationMs = lastChunk.endMs;

  const totalLogicalDuration = chunks.reduce(
    (sum, chunk) => sum + (chunk.endMs - chunk.startMs),
    0
  );

  const totalOverlapMs = chunks.reduce(
    (sum, chunk) => sum + chunk.overlapBeforeMs + chunk.overlapAfterMs,
    0
  ) / 2; // Divide by 2 because each overlap is counted twice (before + after)

  return {
    totalChunks: chunks.length,
    originalDurationMs,
    averageChunkDurationMs: totalLogicalDuration / chunks.length,
    totalOverlapMs,
    overlapPercentage: originalDurationMs > 0 ? (totalOverlapMs / originalDurationMs) * 100 : 0,
  };
}
