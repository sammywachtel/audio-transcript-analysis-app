/**
 * Analytics Service
 *
 * Wraps Firebase Analytics with graceful fallbacks when SDK is unavailable.
 * Tracks chat interactions, timestamp clicks, and cost metrics.
 *
 * Design Philosophy:
 * - No-op fallback when analytics SDK fails (don't break the app)
 * - Type-safe event payloads
 * - Console logging in dev for debugging
 */

import { getAnalytics, logEvent as firebaseLogEvent, Analytics } from 'firebase/analytics';
import { app } from '@/config/firebase-config';

/**
 * Analytics event payloads
 * Define all tracked events here for type safety
 */
export interface ChatQuestionEvent {
  conversationId: string;
  messageLength: number;
  messageCount: number;
}

export interface ChatResponseEvent {
  conversationId: string;
  messageId?: string;
  costUsd: number;
  isUnanswerable: boolean;
  sourceCount: number;
}

export interface TimestampClickEvent {
  conversationId: string;
  segmentId: string;
  startMs: number;
  source: 'chat' | 'transcript' | 'people' | 'search';
}

export interface CostWarningEvent {
  conversationId: string;
  cumulativeCostUsd: number;
  warningLevel: 'primary' | 'escalated';
  messageCount: number;
}

export interface ChatEmptyStateEvent {
  conversationId: string;
  action: 'view' | 'suggestion_click';
  suggestionText?: string;
}

/**
 * Analytics Service
 *
 * Singleton service for tracking user interactions and metrics.
 * Falls back to console logging when Firebase Analytics is unavailable.
 */
class AnalyticsService {
  private analytics: Analytics | null = null;
  private isInitialized = false;
  private isDev = import.meta.env.DEV;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Firebase Analytics
   * Fails gracefully if SDK is unavailable or blocked
   */
  private initialize(): void {
    try {
      this.analytics = getAnalytics(app);
      this.isInitialized = true;

      if (this.isDev) {
        console.log('[Analytics] Firebase Analytics initialized');
      }
    } catch (error) {
      // Analytics might be blocked by ad blockers or unavailable in some environments
      console.warn('[Analytics] Firebase Analytics unavailable, falling back to no-op:', error);
      this.analytics = null;
      this.isInitialized = false;
    }
  }

  /**
   * Log an event to Firebase Analytics
   * Falls back to console logging in dev or when analytics unavailable
   */
  private logEvent(eventName: string, params?: Record<string, unknown>): void {
    if (this.isDev) {
      console.log('[Analytics]', eventName, params);
    }

    if (this.analytics && this.isInitialized) {
      try {
        firebaseLogEvent(this.analytics, eventName, params);
      } catch (error) {
        console.warn('[Analytics] Failed to log event:', eventName, error);
      }
    }
  }

  /**
   * Track chat question submission
   */
  trackChatQuestion(event: ChatQuestionEvent): void {
    this.logEvent('chat_question_sent', {
      conversation_id: event.conversationId,
      message_length: event.messageLength,
      message_count: event.messageCount
    });
  }

  /**
   * Track chat assistant response
   */
  trackChatResponse(event: ChatResponseEvent): void {
    this.logEvent('chat_response_received', {
      conversation_id: event.conversationId,
      message_id: event.messageId,
      cost_usd: event.costUsd,
      is_unanswerable: event.isUnanswerable,
      source_count: event.sourceCount
    });
  }

  /**
   * Track timestamp citation click
   */
  trackTimestampClick(event: TimestampClickEvent): void {
    this.logEvent('timestamp_clicked', {
      conversation_id: event.conversationId,
      segment_id: event.segmentId,
      start_ms: event.startMs,
      source: event.source
    });
  }

  /**
   * Track progressive cost warning display
   */
  trackCostWarning(event: CostWarningEvent): void {
    this.logEvent('cost_warning_shown', {
      conversation_id: event.conversationId,
      cumulative_cost_usd: event.cumulativeCostUsd,
      warning_level: event.warningLevel,
      message_count: event.messageCount
    });
  }

  /**
   * Track chat empty state interaction
   */
  trackChatEmptyState(event: ChatEmptyStateEvent): void {
    this.logEvent('chat_empty_state', {
      conversation_id: event.conversationId,
      action: event.action,
      suggestion_text: event.suggestionText
    });
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
