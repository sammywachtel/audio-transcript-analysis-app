import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Conversation } from '../types';
import { conversationStorage } from '../services/conversationStorage';
import { MOCK_CONVERSATION } from '../constants';
import { useAuth } from './AuthContext';

interface ConversationContextValue {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoaded: boolean;

  // Computed
  activeConversation: Conversation | null;

  // Actions
  loadConversations: () => Promise<void>;
  addConversation: (conversation: Conversation) => Promise<void>;
  updateConversation: (conversation: Conversation) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

/**
 * ConversationProvider - Manages all conversation state and persistence
 *
 * This context separates data management from UI rendering.
 * Components can subscribe to conversation state without knowing
 * about IndexedDB, API calls, or other implementation details.
 *
 * Now integrated with AuthContext to filter conversations by userId.
 * Only loads and displays conversations belonging to the current user.
 */
export const ConversationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Derived state: find the active conversation
  const activeConversation = conversations.find(c => c.conversationId === activeConversationId) || null;

  /**
   * Load conversations for the current user
   * Only loads conversations that belong to the authenticated user
   */
  const loadConversations = useCallback(async () => {
    if (!user) {
      console.log('[ConversationContext] No user, skipping conversation load');
      setConversations([]);
      setIsLoaded(true);
      return;
    }

    try {
      console.log('[ConversationContext] Loading conversations for user:', user.uid);
      const stored = await conversationStorage.loadAllForUser(user.uid);
      setConversations(stored);
      console.log('[ConversationContext] Loaded conversations:', stored.length);
    } catch (e) {
      console.error("[ConversationContext] Failed to load conversations from storage", e);
      // Non-fatal - just show empty state
      setConversations([]);
    } finally {
      setIsLoaded(true);
    }
  }, [user]);

  /**
   * Add a new conversation (typically after upload/processing)
   * Automatically associates the conversation with the current user
   */
  const addConversation = useCallback(async (conversation: Conversation) => {
    if (!user) {
      throw new Error("Must be signed in to save conversations");
    }

    try {
      // Ensure conversation has userId and updatedAt
      const conversationWithUser: Conversation = {
        ...conversation,
        userId: user.uid,
        updatedAt: conversation.updatedAt || new Date().toISOString()
      };

      // Persist first for data safety
      await conversationStorage.save(conversationWithUser);

      // Then update UI
      setConversations(prev => [conversationWithUser, ...prev]);
    } catch (err) {
      console.error("Failed to save conversation", err);
      throw new Error("Failed to save conversation to storage. Please try again.");
    }
  }, [user]);

  /**
   * Update an existing conversation (e.g., speaker rename, person notes)
   * Updates the updatedAt timestamp automatically
   */
  const updateConversation = useCallback(async (conversation: Conversation) => {
    if (!user) {
      throw new Error("Must be signed in to update conversations");
    }

    // Add updatedAt timestamp
    const conversationWithTimestamp: Conversation = {
      ...conversation,
      updatedAt: new Date().toISOString()
    };

    // Update UI immediately for responsive feel
    setConversations(prev =>
      prev.map(c => c.conversationId === conversationWithTimestamp.conversationId ? conversationWithTimestamp : c)
    );

    // Persist in background
    try {
      await conversationStorage.save(conversationWithTimestamp);
    } catch (err) {
      console.error("Failed to persist conversation update", err);
      // Already updated UI, so just log the error
    }
  }, [user]);

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (id: string) => {
    try {
      // Optimistic UI update
      setConversations(prev => prev.filter(c => c.conversationId !== id));

      // Clear active if we just deleted it
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }

      // Persist deletion
      await conversationStorage.delete(id);
    } catch (err) {
      console.error("Failed to delete conversation", err);
      // Could implement revert logic here, but for now just log
    }
  }, [activeConversationId]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const value: ConversationContextValue = {
    conversations,
    activeConversationId,
    isLoaded,
    activeConversation,
    loadConversations,
    addConversation,
    updateConversation,
    deleteConversation,
    setActiveConversationId
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};

/**
 * useConversations - Hook to access conversation context
 * Throws if used outside of ConversationProvider
 */
export const useConversations = (): ConversationContextValue => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationProvider');
  }
  return context;
};
