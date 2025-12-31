/**
 * useChat Hook
 *
 * Manages chat state for a conversation:
 * - Message history (user + assistant)
 * - Draft input text
 * - Loading and error states
 * - Automatic reset when conversation changes
 */

import { useState, useCallback, useEffect } from 'react';
import { sendChatMessage, TimestampSource } from '../services/chatService';

/**
 * Chat message stored in state
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: TimestampSource[];
  costUsd?: number;
  isUnanswerable?: boolean;
  timestamp: Date;
}

interface UseChatOptions {
  conversationId: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  draftInput: string;
  setDraftInput: (input: string) => void;
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearError: () => void;
  resetChat: () => void;
}

/**
 * Chat state management hook
 *
 * Handles message history, sending messages, and state lifecycle.
 * Automatically resets when conversationId changes.
 */
export function useChat({ conversationId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset chat when conversation changes
  useEffect(() => {
    setMessages([]);
    setDraftInput('');
    setError(null);
  }, [conversationId]);

  /**
   * Send a chat message and receive response
   */
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Add user message immediately (optimistic update)
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      // Call backend
      const response = await sendChatMessage(conversationId, message);

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        costUsd: response.costUsd,
        isUnanswerable: response.isUnanswerable,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setDraftInput(''); // Clear input on success

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);

      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Reset chat to empty state
   */
  const resetChat = useCallback(() => {
    setMessages([]);
    setDraftInput('');
    setError(null);
  }, []);

  return {
    messages,
    draftInput,
    setDraftInput,
    isLoading,
    error,
    sendMessage,
    clearError,
    resetChat
  };
}
