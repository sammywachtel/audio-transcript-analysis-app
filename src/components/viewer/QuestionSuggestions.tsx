/**
 * QuestionSuggestions Component
 *
 * Displays rotating contextual question suggestions for the chat.
 * Features:
 * - 44px tap targets for mobile accessibility
 * - Haptic feedback on supported devices
 * - Rotates after each query
 * - Shows in empty state and after unanswerable responses
 */

import React, { useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/utils';
import { analyticsService } from '@/services/analyticsService';

export interface QuestionSuggestionsProps {
  /** Conversation ID for analytics */
  conversationId: string;
  /** Array of suggestion prompts */
  suggestions: string[];
  /** Callback when suggestion is clicked */
  onSuggestionClick: (suggestion: string) => void;
  /** Whether to show header text */
  showHeader?: boolean;
  /** Optional title override */
  title?: string;
}

/**
 * Trigger haptic feedback on supported devices
 * Gracefully degrades if navigator.vibrate is unavailable
 */
function triggerHaptic(): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(10); // Short 10ms vibration
    } catch (error) {
      // Silently fail if vibration is blocked or unavailable
      console.debug('[QuestionSuggestions] Haptic feedback unavailable:', error);
    }
  }
}

/**
 * QuestionSuggestions - contextual chat prompts
 *
 * Provides users with example questions based on conversation context.
 * Rotates suggestions after each query to keep things fresh.
 */
export const QuestionSuggestions: React.FC<QuestionSuggestionsProps> = ({
  conversationId,
  suggestions,
  onSuggestionClick,
  showHeader = true,
  title = 'Try asking:'
}) => {
  // Track view analytics on mount
  useEffect(() => {
    analyticsService.trackChatEmptyState({
      conversationId,
      action: 'view'
    });
  }, [conversationId]);

  const handleClick = (suggestion: string) => {
    // Trigger haptic feedback
    triggerHaptic();

    // Track analytics
    analyticsService.trackChatEmptyState({
      conversationId,
      action: 'suggestion_click',
      suggestionText: suggestion
    });

    // Execute callback
    onSuggestionClick(suggestion);
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center gap-2 text-slate-600">
          <Lightbulb size={16} className="text-slate-400" />
          <p className="text-xs uppercase font-semibold tracking-wider">
            {title}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => handleClick(suggestion)}
            className={cn(
              'w-full text-left text-sm bg-slate-50 border border-slate-200',
              'rounded-lg px-3 py-2.5 transition-all',
              'hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm',
              'active:bg-blue-100',
              'text-slate-700 hover:text-blue-700',
              // 44px minimum tap target for mobile
              'min-h-[44px] flex items-center',
              // Touch action for better mobile responsiveness
              'touch-manipulation'
            )}
            // Accessibility
            aria-label={`Ask: ${suggestion}`}
          >
            "{suggestion}"
          </button>
        ))}
      </div>
    </div>
  );
};
