import { FieldValue } from 'firebase-admin/firestore';
import { db } from './index';

// Processing step enum (keep in sync with frontend types.ts)
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

// Progress percentages per step
const STEP_PERCENTAGES: Record<ProcessingStep, number> = {
  [ProcessingStep.PENDING]: 0,
  [ProcessingStep.UPLOADING]: 15,
  [ProcessingStep.PRE_ANALYZING]: 25,
  [ProcessingStep.TRANSCRIBING]: 40,
  [ProcessingStep.ANALYZING]: 60,
  [ProcessingStep.REASSIGNING]: 75,
  [ProcessingStep.ALIGNING]: 85,
  [ProcessingStep.FINALIZING]: 95,
  [ProcessingStep.COMPLETE]: 100,
  [ProcessingStep.FAILED]: 0
};

// Step metadata interface
export interface StepMeta {
  label: string;
  description?: string;
  category: 'pending' | 'active' | 'success' | 'error';
}

// Self-describing metadata for each processing step
const STEP_META: Record<ProcessingStep, StepMeta> = {
  [ProcessingStep.PENDING]: {
    label: 'Pending',
    description: 'Waiting to start processing',
    category: 'pending'
  },
  [ProcessingStep.UPLOADING]: {
    label: 'Uploading',
    description: 'Uploading audio file to storage',
    category: 'active'
  },
  [ProcessingStep.PRE_ANALYZING]: {
    label: 'Pre-analyzing',
    description: 'Identifying speakers and analyzing audio structure',
    category: 'active'
  },
  [ProcessingStep.TRANSCRIBING]: {
    label: 'Transcribing',
    description: 'Converting speech to text with speaker diarization',
    category: 'active'
  },
  [ProcessingStep.ANALYZING]: {
    label: 'Analyzing',
    description: 'Extracting topics, terms, and detecting people mentioned',
    category: 'active'
  },
  [ProcessingStep.REASSIGNING]: {
    label: 'Reassigning Speakers',
    description: 'Correcting speaker identification based on content analysis',
    category: 'active'
  },
  [ProcessingStep.ALIGNING]: {
    label: 'Aligning',
    description: 'Synchronizing timestamps with precise word-level timing',
    category: 'active'
  },
  [ProcessingStep.FINALIZING]: {
    label: 'Finalizing',
    description: 'Saving results and cleaning up',
    category: 'active'
  },
  [ProcessingStep.COMPLETE]: {
    label: 'Complete',
    description: 'Processing finished successfully',
    category: 'success'
  },
  [ProcessingStep.FAILED]: {
    label: 'Failed',
    description: 'Processing encountered an error',
    category: 'error'
  }
};

export interface ProcessingProgress {
  currentStep: ProcessingStep;
  percentComplete: number;
  stepStartedAt?: FirebaseFirestore.Timestamp;
  estimatedRemainingMs?: number;
  errorMessage?: string;
  stepMeta?: StepMeta;
}

export interface ProcessingTimeline {
  stepName: ProcessingStep;
  startedAt: string; // ISO timestamp (can't use FieldValue.serverTimestamp() in arrays)
  completedAt?: string; // ISO timestamp
  durationMs?: number;
}

/**
 * ProgressManager - Encapsulates Firestore progress updates for transcription
 *
 * Manages the processingProgress and processingTimeline fields in Firestore,
 * providing real-time feedback to the frontend about processing status.
 */
export class ProgressManager {
  private conversationId: string;
  private timeline: ProcessingTimeline[] = [];
  private currentStepStartTime: number = Date.now();

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  /**
   * Transition to a new processing step
   * Updates Firestore with current progress and timeline
   */
  async setStep(step: ProcessingStep, errorMessage?: string): Promise<void> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Complete previous step in timeline if exists
    if (this.timeline.length > 0) {
      const prevStep = this.timeline[this.timeline.length - 1];
      prevStep.completedAt = nowIso;
      prevStep.durationMs = now - this.currentStepStartTime;
    }

    // Add new step to timeline (use ISO strings - FieldValue.serverTimestamp() not allowed in arrays)
    const timelineEntry: ProcessingTimeline = {
      stepName: step,
      startedAt: nowIso
    };
    this.timeline.push(timelineEntry);
    this.currentStepStartTime = now;

    // Build progress object with self-describing metadata
    const baseMeta = STEP_META[step];
    const stepMeta: StepMeta = errorMessage
      ? { ...baseMeta, category: 'error' } // Override category to 'error' when error present
      : baseMeta;

    const progress: ProcessingProgress = {
      currentStep: step,
      percentComplete: STEP_PERCENTAGES[step],
      stepStartedAt: FieldValue.serverTimestamp() as any,
      stepMeta
    };

    if (errorMessage) {
      progress.errorMessage = errorMessage;
    }

    // Update Firestore - wrapped in try/catch so progress failures don't break transcription
    try {
      await db.collection('conversations').doc(this.conversationId).update({
        processingProgress: progress,
        processingTimeline: this.timeline,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`[ProgressManager] Step: ${step} (${STEP_PERCENTAGES[step]}%)`, {
        conversationId: this.conversationId,
        step,
        percentComplete: STEP_PERCENTAGES[step]
      });
    } catch (error) {
      // Log but don't throw - progress updates are nice-to-have, not critical
      console.error(`[ProgressManager] Failed to update progress (non-fatal):`, {
        conversationId: this.conversationId,
        step,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Mark processing as failed
   */
  async setFailed(errorMessage: string): Promise<void> {
    await this.setStep(ProcessingStep.FAILED, errorMessage);
  }

  /**
   * Mark processing as complete
   */
  async setComplete(): Promise<void> {
    await this.setStep(ProcessingStep.COMPLETE);
  }
}
