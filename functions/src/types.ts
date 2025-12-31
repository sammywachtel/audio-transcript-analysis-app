/**
 * Shared types for Cloud Functions
 *
 * These types mirror the frontend types.ts to avoid cross-directory
 * TypeScript compilation issues. Keep in sync with root types.ts.
 */

export interface Speaker {
  speakerId: string;
  displayName: string;
  colorIndex: number;
}

export interface Term {
  termId: string;
  key: string;
  display: string;
  definition: string;
  aliases: string[];
}

export interface TermOccurrence {
  occurrenceId: string;
  termId: string;
  segmentId: string;
  startChar: number;
  endChar: number;
}

export interface Topic {
  topicId: string;
  title: string;
  startIndex: number;
  endIndex: number;
  type: 'main' | 'tangent';
  parentTopicId?: string;
}

export interface Person {
  personId: string;
  name: string;
  affiliation?: string;
  userNotes?: string;
}

export interface Segment {
  segmentId: string;
  index: number;
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Conversation {
  conversationId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  audioUrl?: string;
  status: 'processing' | 'needs_review' | 'complete' | 'failed' | 'aborted';
  abortRequested?: boolean;
  speakers: Record<string, Speaker>;
  segments: Segment[];
  terms: Record<string, Term>;
  termOccurrences: TermOccurrence[];
  topics: Topic[];
  people: Person[];
  alignmentStatus?: 'pending' | 'aligned' | 'fallback';
  alignmentError?: string;
  processingProgress?: ProcessingProgress;
  processingTimeline?: ProcessingTimeline[];
  syncStatus?: 'local_only' | 'synced' | 'pending_upload' | 'conflict';
  lastSyncedAt?: string;
}

export enum ProcessingStep {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  PRE_ANALYZING = 'pre_analyzing',
  TRANSCRIBING = 'transcribing',
  ANALYZING = 'analyzing',
  REASSIGNING = 'reassigning',
  ALIGNING = 'aligning',
  FINALIZING = 'finalizing',
  COMPLETE = 'complete',
  FAILED = 'failed'
}

export interface StepMeta {
  label: string;
  description?: string;
  category: 'pending' | 'active' | 'success' | 'error';
}

export interface ProcessingProgress {
  currentStep: ProcessingStep;
  percentComplete: number;
  stepStartedAt?: string;
  estimatedRemainingMs?: number;
  errorMessage?: string;
  stepMeta?: StepMeta;
}

export interface ProcessingTimeline {
  stepName: ProcessingStep;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}
