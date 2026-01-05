/**
 * Processing metrics collection
 *
 * Records timing and outcome data for each transcription job.
 * Stored in _metrics collection for analysis and monitoring.
 *
 * Extended in v1.4.0 to include:
 * - LLM usage (tokens, compute time) for cost tracking
 * - Estimated costs per service
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './index';
import { log } from './logger';

// =============================================================================
// LLM Usage Types - Track usage for cost calculation
// =============================================================================

/**
 * Gemini API usage metrics (token-based pricing)
 */
export interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;  // e.g., 'gemini-2.5-flash'
}

/**
 * Replicate API usage metrics (compute-time pricing)
 */
export interface ReplicateUsage {
  predictionId?: string;  // Replicate prediction ID for audit trail
  computeTimeSeconds: number;
  model: string;  // e.g., 'whisperx', 'pyannote-diarization'
}

/**
 * LLM usage breakdown by service
 */
export interface LLMUsage {
  // Gemini Analysis Call (topics, terms, people, speaker notes)
  geminiAnalysis: GeminiUsage;
  // Gemini Speaker Reassignment Call
  geminiSpeakerCorrection: GeminiUsage;
  // WhisperX via Replicate (transcription + timestamps)
  whisperx: ReplicateUsage;
  // Speaker Diarization (pyannote via Replicate) - optional
  diarization?: ReplicateUsage;
}

/**
 * Estimated costs by service (USD)
 * Calculated using pricing from _pricing collection
 */
export interface EstimatedCost {
  geminiUsd: number;      // Combined Gemini costs
  whisperxUsd: number;    // WhisperX compute cost
  diarizationUsd: number; // Diarization compute cost
  totalUsd: number;       // Grand total
}

/**
 * Pricing snapshot captured at calculation time.
 * Preserves the exact rates used for billing reconciliation,
 * allowing historical cost recalculation even after prices change.
 */
export interface PricingSnapshot {
  capturedAt: Timestamp;
  geminiPricingId: string | null;      // _pricing doc ID used, or null if default
  whisperxPricingId: string | null;
  diarizationPricingId: string | null;
  rates: {
    geminiInputPerMillion: number;
    geminiOutputPerMillion: number;
    whisperxPerSecond: number;
    diarizationPerSecond: number;
  };
}

/**
 * Result from calculateCost including both the cost breakdown and pricing snapshot.
 * The snapshot allows auditing which rates were used for a given calculation.
 */
export interface CostResult {
  estimatedCost: EstimatedCost;
  pricingSnapshot: PricingSnapshot;
}

// =============================================================================
// Processing Metrics - Enhanced with LLM usage
// =============================================================================

/**
 * Processing stage timings (in milliseconds)
 */
export interface ProcessingMetrics {
  conversationId: string;
  userId: string;
  status: 'success' | 'failed' | 'aborted';
  errorMessage?: string;
  alignmentStatus?: 'aligned' | 'fallback';

  // Stage timings (ms)
  timingMs: {
    download: number;
    whisperx: number;
    buildSegments: number;
    gemini: number;
    speakerCorrection: number;
    transform: number;
    firestore: number;
    total: number;
  };

  // Result counts
  segmentCount: number;
  speakerCount: number;
  termCount: number;
  topicCount: number;
  personCount: number;
  speakerCorrectionsApplied: number;

  // Audio metadata
  audioSizeMB: number;
  durationMs: number;

  // NEW: LLM usage breakdown for cost tracking (added v1.4.0)
  llmUsage?: LLMUsage;

  // NEW: Gemini billing labels for cost attribution (added with Vertex AI migration)
  // Maps to BigQuery billing exports for automatic cost reconciliation
  geminiLabels?: Record<string, string>[];

  // NEW: Estimated costs in USD (calculated from _pricing collection)
  estimatedCost?: EstimatedCost;

  // NEW: Pricing snapshot for billing reconciliation (added for cost visibility)
  // Captures the exact rates used so costs can be audited even after price changes
  pricingSnapshot?: PricingSnapshot;

  // Timestamp
  timestamp: FieldValue;
}

// =============================================================================
// Pricing Types - For cost calculation (stored in _pricing collection)
// =============================================================================

/**
 * Pricing configuration for an LLM service
 * Stored in _pricing collection, editable via Admin Dashboard
 */
export interface PricingConfig {
  pricingId: string;
  model: string;              // 'gemini-2.5-flash', 'whisperx', 'pyannote-diarization'
  service: 'gemini' | 'replicate';

  // Token-based pricing (for Gemini)
  inputPricePerMillion?: number;   // USD per 1M input tokens
  outputPricePerMillion?: number;  // USD per 1M output tokens

  // Time-based pricing (for Replicate)
  pricePerSecond?: number;         // USD per compute second

  // Validity period (allows price changes over time)
  effectiveFrom: Timestamp;        // Start date (inclusive)
  effectiveUntil?: Timestamp;      // End date (exclusive), null = current

  // Metadata
  notes?: string;                  // e.g., "Price increase Jan 2025"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================================================
// Cost Calculation - Looks up pricing from _pricing collection
// =============================================================================

/**
 * Default pricing (used if _pricing collection is empty)
 * Updated as of January 2026 - will be superseded by DB values
 * Source: https://cloud.google.com/vertex-ai/generative-ai/pricing
 */
const DEFAULT_PRICING = {
  gemini: {
    inputPerMillion: 0.15,   // $0.15 per 1M input tokens (< 200K context)
    outputPerMillion: 0.60,   // $0.60 per 1M output tokens (no reasoning)
  },
  replicate: {
    whisperxPerSecond: 0.0023,      // ~$0.14/min
    diarizationPerSecond: 0.0015,   // ~$0.09/min
  }
};

/**
 * Get pricing for a specific model at a given timestamp.
 * Looks up the most recent pricing that was effective at that time.
 *
 * Exported for use by chatMetrics.ts and other modules needing live pricing.
 *
 * @param model - The model name (e.g., 'gemini-2.5-flash', 'whisperx')
 * @param atTimestamp - The timestamp to look up pricing for (defaults to now)
 * @returns PricingConfig if found, null if falling back to defaults
 */
export async function getPricingForModel(
  model: string,
  atTimestamp: Date = new Date()
): Promise<PricingConfig | null> {
  try {
    // Query for pricing configs that were effective at the given timestamp
    const snapshot = await db.collection('_pricing')
      .where('model', '==', model)
      .where('effectiveFrom', '<=', Timestamp.fromDate(atTimestamp))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check if this pricing has expired
    if (data.effectiveUntil && data.effectiveUntil.toDate() <= atTimestamp) {
      return null;
    }

    return {
      pricingId: doc.id,
      ...data
    } as PricingConfig;
  } catch (error) {
    log.warn('Failed to fetch pricing', {
      model,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Calculate estimated cost based on LLM usage and pricing from database.
 * Returns both the cost breakdown and a pricing snapshot for audit purposes.
 *
 * The pricingSnapshot captures which rates were used, enabling:
 * - Billing reconciliation with BigQuery exports
 * - Historical cost recalculation after price changes
 * - Audit trail for cost discrepancies
 */
export async function calculateCost(llmUsage: LLMUsage): Promise<CostResult> {
  const now = new Date();

  // Get pricing for each service (fall back to defaults if not in DB)
  const geminiPricing = await getPricingForModel('gemini-2.5-flash', now);
  const whisperxPricing = await getPricingForModel('whisperx', now);
  const diarizationPricing = await getPricingForModel('pyannote-diarization', now);

  // Calculate Gemini cost (both analysis and speaker correction calls)
  const geminiInputTokens =
    llmUsage.geminiAnalysis.inputTokens + llmUsage.geminiSpeakerCorrection.inputTokens;
  const geminiOutputTokens =
    llmUsage.geminiAnalysis.outputTokens + llmUsage.geminiSpeakerCorrection.outputTokens;

  const inputPricePerMillion = geminiPricing?.inputPricePerMillion ?? DEFAULT_PRICING.gemini.inputPerMillion;
  const outputPricePerMillion = geminiPricing?.outputPricePerMillion ?? DEFAULT_PRICING.gemini.outputPerMillion;

  const geminiUsd =
    (geminiInputTokens / 1_000_000) * inputPricePerMillion +
    (geminiOutputTokens / 1_000_000) * outputPricePerMillion;

  // Calculate WhisperX cost
  const whisperxPerSecond = whisperxPricing?.pricePerSecond ?? DEFAULT_PRICING.replicate.whisperxPerSecond;
  const whisperxUsd = llmUsage.whisperx.computeTimeSeconds * whisperxPerSecond;

  // Calculate diarization cost (if used)
  const diarizationPerSecond = diarizationPricing?.pricePerSecond ?? DEFAULT_PRICING.replicate.diarizationPerSecond;
  const diarizationUsd = (llmUsage.diarization?.computeTimeSeconds ?? 0) * diarizationPerSecond;

  const totalUsd = geminiUsd + whisperxUsd + diarizationUsd;

  // Build pricing snapshot for audit trail
  const pricingSnapshot: PricingSnapshot = {
    capturedAt: Timestamp.now(),
    geminiPricingId: geminiPricing?.pricingId ?? null,
    whisperxPricingId: whisperxPricing?.pricingId ?? null,
    diarizationPricingId: diarizationPricing?.pricingId ?? null,
    rates: {
      geminiInputPerMillion: inputPricePerMillion,
      geminiOutputPerMillion: outputPricePerMillion,
      whisperxPerSecond,
      diarizationPerSecond
    }
  };

  const estimatedCost: EstimatedCost = {
    geminiUsd: Math.round(geminiUsd * 1000000) / 1000000,  // 6 decimal precision
    whisperxUsd: Math.round(whisperxUsd * 1000000) / 1000000,
    diarizationUsd: Math.round(diarizationUsd * 1000000) / 1000000,
    totalUsd: Math.round(totalUsd * 1000000) / 1000000
  };

  return { estimatedCost, pricingSnapshot };
}

/**
 * Record processing metrics to Firestore
 * Stored in _metrics collection for analysis
 */
export async function recordMetrics(metrics: Omit<ProcessingMetrics, 'timestamp'>): Promise<void> {
  try {
    const metricsWithTimestamp: ProcessingMetrics = {
      ...metrics,
      timestamp: FieldValue.serverTimestamp()
    };

    await db.collection('_metrics').add(metricsWithTimestamp);

    log.info('Metrics recorded', {
      conversationId: metrics.conversationId,
      stage: 'metrics',
      status: metrics.status,
      totalMs: metrics.timingMs.total
    });
  } catch (error) {
    // Don't fail the transcription if metrics recording fails
    // Just log the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn('Failed to record metrics', {
      conversationId: metrics.conversationId,
      stage: 'metrics',
      error: errorMessage
    });
  }
}
