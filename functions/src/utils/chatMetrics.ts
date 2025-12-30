/**
 * Chat Metrics Collection
 *
 * Records chat query metrics to _metrics collection for analysis and monitoring.
 * Separate from transcription metrics but uses the same collection.
 *
 * Extended schema for chat queries includes:
 * - Token usage and cost tracking
 * - Response time monitoring
 * - Query type classification
 * - Source quality metrics
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../index';
import { log } from '../logger';

/**
 * Token usage for a chat query
 */
export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;  // e.g., 'gemini-2.5-flash'
}

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
 * Calculate chat cost based on token usage
 *
 * Uses same pricing as transcription (from DEFAULT_PRICING in metrics.ts).
 * Falls back to hardcoded values if pricing lookup fails.
 */
export function calculateChatCost(tokenUsage: ChatTokenUsage): number {
  // Default pricing for Gemini 2.5 Flash (as of late 2024)
  const inputPricePerMillion = 0.075;   // $0.075 per 1M input tokens
  const outputPricePerMillion = 0.30;   // $0.30 per 1M output tokens

  const inputCost = (tokenUsage.inputTokens / 1_000_000) * inputPricePerMillion;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * outputPricePerMillion;
  const totalCost = inputCost + outputCost;

  // Round to 6 decimal places (micro-cents precision)
  return Math.round(totalCost * 1_000_000) / 1_000_000;
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
