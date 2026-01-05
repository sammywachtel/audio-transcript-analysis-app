/**
 * Chat Metrics Collection
 *
 * Records chat query metrics to _metrics collection for analysis and monitoring.
 * Separate from transcription metrics but uses the same collection.
 *
 * Extended schema for chat queries includes:
 * - Token usage and cost tracking (using live pricing from _pricing collection)
 * - Response time monitoring
 * - Query type classification
 * - Source quality metrics
 * - Pricing snapshot for billing reconciliation
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../index';
import { log } from '../logger';
import { getPricingForModel } from '../metrics';

/**
 * Token usage for a chat query
 */
export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;  // e.g., 'gemini-2.5-flash'
}

/**
 * Result from chat cost calculation.
 * Includes the cost and pricing info for reconciliation.
 */
export interface ChatCostResult {
  costUsd: number;
  pricingId: string | null;        // _pricing doc ID used, null if default
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  capturedAt: Timestamp;
}

/**
 * Default pricing for Gemini 2.5 Flash (as of January 2026).
 * Used when _pricing collection has no matching entry.
 * Source: https://cloud.google.com/vertex-ai/generative-ai/pricing
 */
const DEFAULT_CHAT_PRICING = {
  inputPricePerMillion: 0.15,   // $0.15 per 1M input tokens (< 200K context)
  outputPricePerMillion: 0.60    // $0.60 per 1M output tokens (no reasoning)
};

/**
 * Chat metrics record for _metrics collection
 */
export interface ChatMetrics {
  type: 'chat';  // Discriminator from transcription metrics
  conversationId: string;
  userId: string;
  queryType: 'question' | 'follow_up';
  tokenUsage: ChatTokenUsage;
  costUsd: number;
  responseTimeMs: number;
  sourcesCount: number;
  isUnanswerable: boolean;
  // Gemini billing labels for cost attribution (added with Vertex AI migration)
  // Maps to BigQuery billing exports for automatic cost reconciliation
  geminiLabels?: Record<string, string>;
  // Pricing info for billing reconciliation
  pricingId?: string | null;         // _pricing doc ID used, null if default
  pricingSnapshot?: {                // Snapshot of rates used for this query
    capturedAt: Timestamp;
    inputPricePerMillion: number;
    outputPricePerMillion: number;
  };
  timestamp: FieldValue;
}

/**
 * Record chat query metrics to Firestore
 *
 * @param metrics - Chat metrics (without timestamp, added automatically)
 */
export async function recordChatMetrics(
  metrics: Omit<ChatMetrics, 'timestamp'>
): Promise<void> {
  try {
    const metricsWithTimestamp: ChatMetrics = {
      ...metrics,
      timestamp: FieldValue.serverTimestamp()
    };

    await db.collection('_metrics').add(metricsWithTimestamp);

    log.info('Chat metrics recorded', {
      conversationId: metrics.conversationId,
      userId: metrics.userId,
      queryType: metrics.queryType,
      responseTimeMs: metrics.responseTimeMs,
      sourcesCount: metrics.sourcesCount,
      costUsd: metrics.costUsd
    });
  } catch (error) {
    // Don't fail the chat request if metrics recording fails
    // Just log the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn('Failed to record chat metrics', {
      conversationId: metrics.conversationId,
      userId: metrics.userId,
      error: errorMessage
    });
  }
}

/**
 * Calculate chat cost based on token usage.
 *
 * Pulls live pricing from _pricing collection via getPricingForModel.
 * Falls back to hardcoded defaults if no pricing found in DB.
 *
 * Returns full pricing info for billing reconciliation.
 */
export async function calculateChatCost(tokenUsage: ChatTokenUsage): Promise<ChatCostResult> {
  const now = new Date();

  // Look up live pricing for the chat model
  // Note: tokenUsage.model might be 'gemini-2.0-flash-exp' but we use gemini-2.5-flash pricing
  // since they share the same pricing tier
  const pricing = await getPricingForModel('gemini-2.5-flash', now);

  const inputPricePerMillion = pricing?.inputPricePerMillion ?? DEFAULT_CHAT_PRICING.inputPricePerMillion;
  const outputPricePerMillion = pricing?.outputPricePerMillion ?? DEFAULT_CHAT_PRICING.outputPricePerMillion;

  const inputCost = (tokenUsage.inputTokens / 1_000_000) * inputPricePerMillion;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * outputPricePerMillion;
  const totalCost = inputCost + outputCost;

  // Round to 6 decimal places (micro-cents precision)
  const costUsd = Math.round(totalCost * 1_000_000) / 1_000_000;

  return {
    costUsd,
    pricingId: pricing?.pricingId ?? null,
    inputPricePerMillion,
    outputPricePerMillion,
    capturedAt: Timestamp.now()
  };
}

/**
 * Determine query type based on message content
 *
 * Simple heuristic:
 * - "follow_up" if message starts with follow-up indicators
 * - "question" otherwise
 */
export function classifyQueryType(message: string): 'question' | 'follow_up' {
  const normalized = message.trim().toLowerCase();

  const followUpIndicators = [
    'also',
    'and ',
    'what about',
    'how about',
    'what else',
    'tell me more',
    'continue',
    'go on',
    'additionally'
  ];

  for (const indicator of followUpIndicators) {
    if (normalized.startsWith(indicator)) {
      return 'follow_up';
    }
  }

  return 'question';
}
