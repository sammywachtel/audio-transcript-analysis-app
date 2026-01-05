/**
 * Metrics Service
 *
 * Frontend service for querying observability collections.
 * Provides typed queries for:
 * - Global stats (admin dashboard)
 * - Daily stats (time-series charts)
 * - User stats (personal usage)
 * - Metrics history (job details)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase-config';

// =============================================================================
// Types (mirrored from backend for frontend use)
// =============================================================================

/**
 * LLM usage metrics
 */
export interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ReplicateUsage {
  predictionId?: string;
  computeTimeSeconds: number;
  model: string;
}

export interface LLMUsage {
  geminiAnalysis: GeminiUsage;
  geminiSpeakerCorrection: GeminiUsage;
  whisperx: ReplicateUsage;
  diarization?: ReplicateUsage;
}

export interface EstimatedCost {
  geminiUsd: number;
  whisperxUsd: number;
  diarizationUsd: number;
  totalUsd: number;
}

/**
 * Processing metrics (from _metrics collection)
 */
export interface ProcessingMetric {
  id?: string;  // Firestore document ID (added by query functions)
  conversationId: string;
  userId: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  alignmentStatus?: 'aligned' | 'fallback';
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
  segmentCount: number;
  speakerCount: number;
  termCount: number;
  topicCount: number;
  personCount: number;
  speakerCorrectionsApplied: number;
  audioSizeMB: number;
  durationMs: number;
  llmUsage?: LLMUsage;
  estimatedCost?: EstimatedCost;
  pricingSnapshot?: PricingSnapshot;  // Captured pricing rates used for cost calculation
  timestamp: Timestamp;
}

/**
 * Chat metrics (from _metrics collection with type: 'chat')
 */
export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ChatMetric {
  id?: string;  // Firestore document ID (added by query functions)
  type: 'chat';
  conversationId: string;
  userId: string;
  queryType: 'question' | 'follow_up';
  tokenUsage: ChatTokenUsage;
  costUsd: number;
  responseTimeMs: number;
  sourcesCount: number;
  isUnanswerable: boolean;
  geminiLabels?: Record<string, string>;
  pricingId?: string | null;
  pricingSnapshot?: PricingSnapshot;
  timestamp: Timestamp;
}

/**
 * Pricing snapshot captured at metric recording time
 */
export interface PricingSnapshot {
  capturedAt: Timestamp;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  pricePerSecond?: number;
}

/**
 * User stats (from _user_stats collection)
 */
export interface WindowStats {
  conversationsCreated: number;
  conversationsDeleted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  audioHoursProcessed: number;
  estimatedCostUsd: number;
}

export interface LifetimeStats extends WindowStats {
  conversationsExisting: number;
  totalAudioFiles: number;
}

export interface UserStats {
  userId: string;
  lifetime: LifetimeStats;
  last7Days: WindowStats;
  last30Days: WindowStats;
  firstActivityAt: Timestamp;
  lastActivityAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Global stats (from _global_stats collection)
 */
export interface GlobalStats {
  users: {
    totalUsers: number;
    activeUsersLast7Days: number;
    activeUsersLast30Days: number;
  };
  processing: {
    totalJobsAllTime: number;
    successRate: number;
    avgProcessingTimeMs: number;
    totalAudioHoursProcessed: number;
  };
  llmUsage: {
    totalGeminiInputTokens: number;
    totalGeminiOutputTokens: number;
    totalWhisperXComputeSeconds: number;
    estimatedTotalCostUsd: number;
  };
  conversations: {
    totalConversationsCreated: number;
    totalConversationsDeleted: number;
    totalConversationsExisting: number;
  };
  lastUpdatedAt: Timestamp;
  computedAt: string;
}

/**
 * Daily stats (from _daily_stats collection)
 */
export interface DailyStats {
  date: string;
  activeUsers: number;
  newUsers: number;
  conversationsCreated: number;
  conversationsDeleted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  audioHoursProcessed: number;
  geminiTokensUsed: number;
  whisperXComputeSeconds: number;
  estimatedCostUsd: number;
  avgProcessingTimeMs: number;
  createdAt: Timestamp;
}

/**
 * Pricing configuration (from _pricing collection)
 */
export interface PricingConfig {
  pricingId: string;
  model: string;
  service: 'gemini' | 'replicate';
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  pricePerSecond?: number;
  effectiveFrom: Timestamp;
  effectiveUntil?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get global stats (admin only)
 */
export async function getGlobalStats(): Promise<GlobalStats | null> {
  try {
    const docRef = doc(db, '_global_stats', 'current');
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      console.warn('[MetricsService] No global stats found');
      return null;
    }

    return snapshot.data() as GlobalStats;
  } catch (error) {
    console.error('[MetricsService] Failed to fetch global stats:', error);
    throw error;
  }
}

/**
 * Get daily stats for a date range (admin only)
 */
export async function getDailyStats(
  startDate: string,  // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
): Promise<DailyStats[]> {
  try {
    const q = query(
      collection(db, '_daily_stats'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as DailyStats);
  } catch (error) {
    console.error('[MetricsService] Failed to fetch daily stats:', error);
    throw error;
  }
}

/**
 * Get user stats for current user
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
  try {
    const docRef = doc(db, '_user_stats', userId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      console.warn('[MetricsService] No user stats found for:', userId);
      return null;
    }

    return snapshot.data() as UserStats;
  } catch (error) {
    console.error('[MetricsService] Failed to fetch user stats:', error);
    throw error;
  }
}

/**
 * Get all user stats summaries (admin only)
 * Returns limited fields for the user list view
 */
export async function getAllUserStatsSummaries(
  maxResults: number = 100
): Promise<Array<{
  userId: string;
  conversationsExisting: number;
  audioHoursProcessed: number;
  estimatedCostUsd: number;
  lastActivityAt: Timestamp;
}>> {
  try {
    const q = query(
      collection(db, '_user_stats'),
      orderBy('lastActivityAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as UserStats;
      return {
        userId: data.userId,
        conversationsExisting: data.lifetime.conversationsExisting,
        audioHoursProcessed: data.lifetime.audioHoursProcessed,
        estimatedCostUsd: data.lifetime.estimatedCostUsd,
        lastActivityAt: data.lastActivityAt
      };
    });
  } catch (error) {
    console.error('[MetricsService] Failed to fetch user stats summaries:', error);
    throw error;
  }
}

/**
 * Get recent processing metrics (admin or filtered by user)
 *
 * IMPORTANT: Non-admin users can only read their own metrics due to Firestore rules.
 * The userId filter MUST be applied in the Firestore query, not client-side,
 * otherwise non-admin users will get permission errors.
 */
export async function getRecentMetrics(
  options: {
    userId?: string;
    maxResults?: number;
    status?: 'success' | 'failed';
  } = {}
): Promise<ProcessingMetric[]> {
  const { userId, maxResults = 50, status } = options;

  try {
    // Build query with optional userId filter
    // For non-admins, userId MUST be provided to satisfy security rules
    let q;
    if (userId) {
      // Query with userId filter - required for non-admins
      q = query(
        collection(db, '_metrics'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(maxResults)
      );
    } else {
      // Query without userId filter - only works for admins
      q = query(
        collection(db, '_metrics'),
        orderBy('timestamp', 'desc'),
        limit(maxResults)
      );
    }

    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(doc => ({
      ...(doc.data() as ProcessingMetric),
      id: doc.id  // Include Firestore document ID for detail views
    }));

    // Apply status filter client-side (minor optimization potential but keeps code simple)
    if (status) {
      results = results.filter(m => m.status === status);
    }

    return results;
  } catch (error) {
    console.error('[MetricsService] Failed to fetch recent metrics:', error);
    throw error;
  }
}

/**
 * Get pricing configuration (for cost display)
 */
export async function getPricingConfigs(): Promise<PricingConfig[]> {
  try {
    const q = query(
      collection(db, '_pricing'),
      orderBy('effectiveFrom', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      pricingId: doc.id,
      ...doc.data()
    } as PricingConfig));
  } catch (error) {
    console.error('[MetricsService] Failed to fetch pricing configs:', error);
    throw error;
  }
}

/**
 * Get current pricing for a specific model
 */
export async function getCurrentPricing(model: string): Promise<PricingConfig | null> {
  try {
    const now = Timestamp.now();
    const q = query(
      collection(db, '_pricing'),
      where('model', '==', model),
      where('effectiveFrom', '<=', now),
      orderBy('effectiveFrom', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check if expired
    if (data.effectiveUntil && data.effectiveUntil.toDate() <= now.toDate()) {
      return null;
    }

    return {
      pricingId: doc.id,
      ...data
    } as PricingConfig;
  } catch (error) {
    console.error('[MetricsService] Failed to fetch current pricing:', error);
    throw error;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format milliseconds as human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format USD amount
 */
export function formatUsd(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(6)}`;
  }
  if (amount < 1) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Get date range for last N days
 */
export function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

// =============================================================================
// New Functions for Cost Verification & Chat Metrics
// =============================================================================

/**
 * Get single metric by document ID
 */
export async function getMetricById(metricId: string): Promise<ProcessingMetric | ChatMetric | null> {
  try {
    const docRef = doc(db, '_metrics', metricId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      console.warn('[MetricsService] No metric found with ID:', metricId);
      return null;
    }

    const docData = snapshot.data();
    const data = { ...docData, id: snapshot.id };
    // Check if it's a chat metric or processing metric
    if ('type' in docData && docData.type === 'chat') {
      return data as ChatMetric;
    }
    return data as ProcessingMetric;
  } catch (error) {
    console.error('[MetricsService] Failed to fetch metric by ID:', error);
    throw error;
  }
}

/**
 * Get chat metrics with optional filtering
 */
export async function getChatMetrics(options?: {
  conversationId?: string;
  maxResults?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<ChatMetric[]> {
  try {
    const { conversationId, maxResults = 100, startDate, endDate } = options || {};

    // Build query constraints
    const constraints = [
      where('type', '==', 'chat'),
      orderBy('timestamp', 'desc')
    ];

    if (conversationId) {
      constraints.unshift(where('conversationId', '==', conversationId));
    }

    if (startDate) {
      constraints.push(where('timestamp', '>=', Timestamp.fromDate(startDate)));
    }

    if (endDate) {
      constraints.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
    }

    const q = query(collection(db, '_metrics'), ...constraints, limit(maxResults));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      ...(doc.data() as ChatMetric),
      id: doc.id  // Include Firestore document ID for detail views
    }));
  } catch (error) {
    console.error('[MetricsService] Failed to fetch chat metrics:', error);
    throw error;
  }
}

/**
 * Cost variance status type
 */
export type VarianceStatus = 'match' | 'minor' | 'significant';

/**
 * Recalculate cost using current pricing vs stored snapshot
 */
export async function recalculateCostWithCurrentPricing(
  metric: ProcessingMetric | ChatMetric
): Promise<{
  originalUsd: number;
  recalculatedUsd: number;
  variance: number;
  variancePercent: number;
  status: VarianceStatus;
}> {
  try {
    // Determine original cost
    let originalUsd = 0;
    if ('estimatedCost' in metric && metric.estimatedCost) {
      originalUsd = metric.estimatedCost.totalUsd;
    } else if ('costUsd' in metric) {
      originalUsd = metric.costUsd;
    }

    // If no pricing snapshot, can't recalculate - return original as both
    if (!metric.pricingSnapshot) {
      return {
        originalUsd,
        recalculatedUsd: originalUsd,
        variance: 0,
        variancePercent: 0,
        status: 'match'
      };
    }

    // Recalculate based on metric type
    let recalculatedUsd = 0;

    if ('type' in metric && metric.type === 'chat') {
      // Chat metric recalculation
      const chatMetric = metric as ChatMetric;
      const currentPricing = await getCurrentPricing(chatMetric.tokenUsage.model);

      if (currentPricing) {
        const inputCost = (chatMetric.tokenUsage.inputTokens / 1_000_000) *
          (currentPricing.inputPricePerMillion || 0);
        const outputCost = (chatMetric.tokenUsage.outputTokens / 1_000_000) *
          (currentPricing.outputPricePerMillion || 0);
        recalculatedUsd = inputCost + outputCost;
      } else {
        // No current pricing found, use snapshot
        recalculatedUsd = originalUsd;
      }
    } else {
      // Processing metric recalculation
      const processingMetric = metric as ProcessingMetric;

      if (!processingMetric.llmUsage) {
        return {
          originalUsd,
          recalculatedUsd: originalUsd,
          variance: 0,
          variancePercent: 0,
          status: 'match'
        };
      }

      // Recalculate Gemini costs
      const geminiAnalysisPricing = await getCurrentPricing(processingMetric.llmUsage.geminiAnalysis.model);
      let geminiUsd = 0;

      if (geminiAnalysisPricing) {
        const inputCost = (processingMetric.llmUsage.geminiAnalysis.inputTokens / 1_000_000) *
          (geminiAnalysisPricing.inputPricePerMillion || 0);
        const outputCost = (processingMetric.llmUsage.geminiAnalysis.outputTokens / 1_000_000) *
          (geminiAnalysisPricing.outputPricePerMillion || 0);
        geminiUsd += inputCost + outputCost;
      }

      // Add speaker correction if exists
      if (processingMetric.llmUsage.geminiSpeakerCorrection) {
        const speakerPricing = await getCurrentPricing(processingMetric.llmUsage.geminiSpeakerCorrection.model);
        if (speakerPricing) {
          const inputCost = (processingMetric.llmUsage.geminiSpeakerCorrection.inputTokens / 1_000_000) *
            (speakerPricing.inputPricePerMillion || 0);
          const outputCost = (processingMetric.llmUsage.geminiSpeakerCorrection.outputTokens / 1_000_000) *
            (speakerPricing.outputPricePerMillion || 0);
          geminiUsd += inputCost + outputCost;
        }
      }

      // Recalculate WhisperX cost
      let whisperxUsd = 0;
      if (processingMetric.llmUsage.whisperx) {
        const whisperxPricing = await getCurrentPricing(processingMetric.llmUsage.whisperx.model);
        if (whisperxPricing && whisperxPricing.pricePerSecond) {
          whisperxUsd = processingMetric.llmUsage.whisperx.computeTimeSeconds * whisperxPricing.pricePerSecond;
        }
      }

      // Recalculate diarization cost if exists
      let diarizationUsd = 0;
      if (processingMetric.llmUsage.diarization) {
        const diarizationPricing = await getCurrentPricing(processingMetric.llmUsage.diarization.model);
        if (diarizationPricing && diarizationPricing.pricePerSecond) {
          diarizationUsd = processingMetric.llmUsage.diarization.computeTimeSeconds * diarizationPricing.pricePerSecond;
        }
      }

      recalculatedUsd = geminiUsd + whisperxUsd + diarizationUsd;
    }

    // Calculate variance
    const variance = recalculatedUsd - originalUsd;
    const variancePercent = originalUsd > 0 ? Math.abs(variance / originalUsd) * 100 : 0;

    // Determine status based on variance thresholds
    let status: VarianceStatus = 'match';
    if (variancePercent > 5) {
      status = 'significant';
    } else if (variancePercent > 1) {
      status = 'minor';
    }

    return {
      originalUsd,
      recalculatedUsd,
      variance,
      variancePercent,
      status
    };
  } catch (error) {
    console.error('[MetricsService] Failed to recalculate cost:', error);
    // Return original values on error
    const originalUsd = ('estimatedCost' in metric && metric.estimatedCost)
      ? metric.estimatedCost.totalUsd
      : ('costUsd' in metric ? metric.costUsd : 0);

    return {
      originalUsd,
      recalculatedUsd: originalUsd,
      variance: 0,
      variancePercent: 0,
      status: 'match'
    };
  }
}
