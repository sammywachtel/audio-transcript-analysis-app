# Chunk Merge Architecture

This document explains the chunk merge system - the final step in processing large audio files (>30 minutes). After all chunks have been processed individually, the merge layer stitches them back together into a single coherent conversation.

## Overview

The chunk merge system is part of the large file upload flow:

```
Audio Upload → Chunking → Chunk Processing → Chunk Merge → Complete
                ↓              ↓                  ↓
           (30s overlap)  (WhisperX + Gemini)  (Deduplicate)
```

**Purpose**: Transform multiple chunk artifacts into a single merged conversation document with no duplicates or gaps.

## System Architecture

### Data Flow

```
conversations/{id}/chunks/*  → mergeChunks() → conversations/{id}
         ↓                           ↓                    ↓
   ChunkArtifacts           Deduplicate & Merge     Final Conversation
```

### Components

1. **Chunk Artifacts** (`conversations/{id}/chunks/{chunkIndex}`)
   - Firestore subcollection storing per-chunk results
   - Each artifact contains: segments, speakers, terms, topics, people
   - Includes overlap boundaries for deduplication

2. **Merge Worker** (`functions/src/chunkMerge.ts`)
   - Cloud Function invoked by Cloud Tasks
   - Loads all chunk artifacts
   - Deduplicates segments in overlap regions
   - Merges speakers, terms, topics, people
   - Writes final conversation document

3. **Merge Trigger** (`processTranscription.ts`)
   - Checks if all chunks complete after each chunk finishes
   - Enqueues merge task atomically (guard flag prevents duplicates)
   - Updates conversation status to 'merging'

## Status Transitions

```
processing → chunking → merging → complete
                ↓           ↓
           (chunks enqueued) (merge enqueued)
```

- **processing**: Initial audio upload (before chunking decision)
- **chunking**: Chunks created, tasks enqueued, processing in progress
- **merging**: All chunks complete, merge task running
- **complete**: Merge complete, final conversation ready

## Deduplication Strategy

### Problem

Chunks have 30-second overlaps for speaker continuity. Without deduplication, we'd have duplicate segments:

```
Chunk 0: [0s────────────────15s]──[15s──18s]
                             ↑  overlap  ↑
Chunk 1:                    [15s──18s]──[18s────────30s]
```

Segments in the overlap region (15s-18s) appear in **both chunks**.

### Solution: Preferred Chunk Logic

For each segment, we determine which chunk "owns" it:

```typescript
const preferredChunk = getPreferredChunkForTimestamp(segment.startMs, chunks);
if (preferredChunk === artifact.chunkIndex) {
  // This chunk owns this segment - include it
  mergedSegments.push(segment);
}
```

**Rule**: The **later chunk** (higher index) owns segments in the overlap region.

**Why?** Ensures deterministic, consistent deduplication. Each segment is attributed to exactly one chunk.

### Example

```
Chunk 0 segments:
  [0ms─5000ms]   ← kept (chunk 0 owns)
  [5000ms─10000ms]  ← kept (chunk 0 owns)
  [15000ms─18000ms] ← DROPPED (chunk 1 owns overlap)

Chunk 1 segments:
  [15000ms─18000ms] ← kept (chunk 1 owns overlap)
  [18000ms─25000ms] ← kept (chunk 1 owns)

Merged result:
  [0ms─5000ms, 5000ms─10000ms, 15000ms─18000ms, 18000ms─25000ms]
  ↑ no duplicates, no gaps
```

## Merging Other Data

### Speakers

Simple union - speaker IDs should be consistent across chunks (context propagation ensures this):

```typescript
for (const [speakerId, speaker] of Object.entries(artifact.speakers)) {
  if (!mergedSpeakers[speakerId]) {
    mergedSpeakers[speakerId] = speaker;
  }
}
```

### Terms & Occurrences

- **Terms**: Deduplicate by `termId` (Gemini generates deterministic IDs)
- **Term Occurrences**: Only include if the referenced segment was kept

```typescript
for (const occurrence of artifact.termOccurrences) {
  if (seenSegmentIds.has(occurrence.segmentId)) {
    mergedTermOccurrences.push(occurrence);
  }
}
```

### Topics

Deduplicate by `topicId`, sort by `startIndex`:

```typescript
for (const topic of artifact.topics) {
  if (!seenTopicIds.has(topic.topicId)) {
    mergedTopics.push(topic);
  }
}
mergedTopics.sort((a, b) => a.startIndex - b.startIndex);
```

### People

Deduplicate by `personId`:

```typescript
for (const person of artifact.people) {
  if (!seenPersonIds.has(person.personId)) {
    mergedPeople.push(person);
  }
}
```

## Idempotency

The merge operation is idempotent - safe to run multiple times:

```typescript
if (chunkingMeta.mergedAt) {
  console.log('Already merged, skipping');
  return;
}
```

**Why idempotency matters**:
- Cloud Tasks may retry failed merges
- Manual reruns during debugging
- Prevents data corruption from duplicate merges

## Error Handling

### Validation

Before merging, we validate:

1. **Conversation exists**: `throw new Error('Conversation not found')`
2. **Chunking metadata present**: `throw new Error('No chunking metadata')`
3. **All chunks present**: `throw new Error('Missing chunks: expected X, found Y')`

### Failure Recovery

If merge fails:

1. Status updated to `'failed'` with error message
2. Cloud Tasks retries with exponential backoff
3. Manual retry possible (idempotency ensures safety)

### Monitoring

Key log events:

```
[ChunkMerge] Starting merge process
[ChunkMerge] Loaded chunk artifacts: { chunkCount, totalSegments }
[ChunkMerge] Segment deduplication complete: { duplicatesRemoved }
[ChunkMerge] ✅ Merge complete: { finalCounts, durationMs }
```

## Security

### Firestore Rules

```javascript
match /conversations/{conversationId}/chunks/{chunkIndex} {
  // Users can read chunks for their own conversations
  allow read: if isAuthenticated()
    && get(.../conversations/$(conversationId)).data.userId == request.auth.uid;

  // Only Cloud Functions can write chunks
  allow write: if false;
}
```

Chunk artifacts are read-only from the client - only Cloud Functions can create/modify them.

## Performance Considerations

### Memory Usage

- Loads all chunk artifacts into memory
- For very large files (multiple GB), this could be substantial
- Current limit: 512MiB function memory (sufficient for ~1000 chunks)

### Processing Time

- O(n) where n = total segments across all chunks
- Typical: <1 second for 100 segments
- Timeout: 10 minutes (generous buffer)

### Cost Optimization

Merge is cheaper than chunk processing:
- No LLM calls (Gemini already ran on chunks)
- Pure data transformation
- Fast execution (<1s typically)

## Future Improvements

### 1. Parallel Segment Processing

Current implementation processes segments sequentially. Could parallelize with worker threads for very large merges.

### 2. Streaming Merge

For extremely large files, stream chunk artifacts instead of loading all into memory.

### 3. Progressive Merge

Start merging early chunks while later chunks still processing (reduces time to first view).

### 4. Speaker Re-identification

Currently, speaker IDs are preserved from chunks. Future: use voice embeddings to re-identify speakers across chunks (handles speaker ID mismatches).

## Related Documentation

- [Chunking Overview](./chunking.md) - How audio is split into chunks
- [Context Propagation](./chunk-context.md) - How data flows between chunks
- [Chunk Bounds](./chunk-bounds.md) - Timestamp math for overlap regions
- [How-To: Deploy Functions](../how-to/deploy.md) - Deploying the merge function

## Key Takeaways

1. **Chunk artifacts** store intermediate results in `conversations/{id}/chunks/*`
2. **Merge trigger** fires atomically when all chunks complete
3. **Deduplication** uses "preferred chunk" logic (later chunk wins in overlaps)
4. **Idempotency** ensures safe retries and manual reruns
5. **Status flow**: `chunking → merging → complete`

The merge layer is the final step that transforms chunked processing back into a seamless user experience.
