import { vi } from 'vitest';

/**
 * Conversation Storage Mocks
 *
 * Mock for conversation storage operations used in tests.
 * Provides a clean slate between test runs.
 */

// In-memory storage for mock conversations
let mockConversations: Map<string, any> = new Map();

export const mockConversationStorage = {
  getConversations: vi.fn(() => Array.from(mockConversations.values())),
  getConversation: vi.fn((id: string) => mockConversations.get(id) || null),
  saveConversation: vi.fn((conversation: any) => {
    mockConversations.set(conversation.conversationId, conversation);
  }),
  deleteConversation: vi.fn((id: string) => {
    mockConversations.delete(id);
  }),
  clearAll: vi.fn(() => {
    mockConversations.clear();
  })
};

// Reset storage state between tests
export const resetConversationStorage = () => {
  mockConversations.clear();
  vi.clearAllMocks();
};
