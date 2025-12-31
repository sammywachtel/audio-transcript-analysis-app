/**
 * useChat Hook
 *
 * Manages chat state for a conversation:
 * - Integrates with chatHistoryService for persistence
 * - Draft input text
 * - Loading and error states
 * - Optimistic updates for responsive UX
 */

import { useState, useCallback } from 'react';
import { sendChatMessage } from '../services/chatService';
import { chatHistoryService, TimestampSource } from '../services/chatHistoryService';

/**
 * Chat message for display
 * Note: messages come from useChatHistory, this hook just handles sending
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: TimestampSource[];
  costUsd?: number;
  isUnanswerable?: boolean;
  createdAt: string; // ISO timestamp
}

interface UseChatOptions {
  conversationId: string;
  messageCount: number; // From useChatHistory, used for limit checking
}

interface UseChatReturn {
  draftInput: string;
  setDraftInput: (input: string) => void;
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearError: () => void;
  isAtLimit: boolean; // True when at 50 message limit
}

/**
 * Chat state management hook
 *
 * Handles message sending and persistence.
 * Works with useChatHistory for message loading/display.
 */
export function useChat({ conversationId, messageCount }: UseChatOptions): UseChatReturn {
  const [draftInput, setDraftInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we're at the 50 message limit
  const isAtLimit = messageCount >= 50;

  /**
   * Send a chat message and persist to Firestore
   * Adds both user message and assistant response to history
   */
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading || isAtLimit) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Add user message to Firestore
      // Real-time listener in useChatHistory will show it immediately
      await chatHistoryService.addMessage(conversationId, {
        role: 'user',
        content: message
      });

      // Call backend for AI response
      const response = await sendChatMessage(conversationId, message);

      // Convert chatService sources to chatHistoryService format
      // chatService has segmentIndex, chatHistoryService expects full source data
      const sources: TimestampSource[] = response.sources
        .filter(s => s.segmentId && s.startMs !== undefined && s.endMs !== undefined)
        .map(s => ({
          segmentId: s.segmentId!,
          startMs: s.startMs!,
          endMs: s.endMs!,
          speaker: s.speakerId || 'Unknown',
          text: '' // Text is not included in chatService response, but not critical for display
        }));

      // Add assistant response to Firestore
      await chatHistoryService.addMessage(conversationId, {
        role: 'assistant',
        content: response.answer,
        sources: sources.length > 0 ? sources : undefined,
        costUsd: response.costUsd,
        isUnanswerable: response.isUnanswerable
      });

      setDraftInput(''); // Clear input on success

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading, isAtLimit]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    draftInput,
    setDraftInput,
    isLoading,
    error,
    sendMessage,
    clearError,
    isAtLimit
  };
}
