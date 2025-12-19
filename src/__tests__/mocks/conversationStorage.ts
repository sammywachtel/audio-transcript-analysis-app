import { vi } from 'vitest';
import { Conversation } from '../../../types';

/**
 * Mock ConversationStorage for testing auth-related storage operations
 *
 * Simulates IndexedDB operations without actually using the database.
 * Makes tests faster and more predictable.
 */

// In-memory storage for test conversations
let testConversations: Map<string, Conversation & { audioBlob?: Blob }> = new Map();

export const mockConversationStorage = {
  save: vi.fn(async (conversation: Conversation) => {
    testConversations.set(conversation.conversationId, { ...conversation });
  }),

  loadAll: vi.fn(async (): Promise<Conversation[]> => {
    return Array.from(testConversations.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }),

  loadById: vi.fn(async (id: string): Promise<Conversation | null> => {
    return testConversations.get(id) || null;
  }),

  loadAllForUser: vi.fn(async (userId: string): Promise<Conversation[]> => {
    return Array.from(testConversations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt).getTime();
        return bTime - aTime;
      });
  }),

  delete: vi.fn(async (id: string) => {
    testConversations.delete(id);
  }),

  clearAll: vi.fn(async () => {
    testConversations.clear();
  }),

  hasOrphanConversations: vi.fn(async (): Promise<boolean> => {
    return Array.from(testConversations.values()).some(
      c => !c.userId || c.userId === 'anonymous' || c.userId === 'local'
    );
  }),

  migrateOrphanConversations: vi.fn(async (userId: string): Promise<number> => {
    let count = 0;

    testConversations.forEach((conversation, id) => {
      if (!conversation.userId || conversation.userId === 'anonymous' || conversation.userId === 'local') {
        testConversations.set(id, {
          ...conversation,
          userId,
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    return count;
  })
};

// Test helpers
export const createTestConversation = (
  overrides?: Partial<Conversation>
): Conversation => ({
  conversationId: `conv-${Date.now()}-${Math.random()}`,
  userId: 'test-user-123',
  title: 'Test Conversation',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  durationMs: 60000,
  status: 'complete',
  speakers: {},
  segments: [],
  terms: {},
  termOccurrences: [],
  topics: [],
  people: [],
  ...overrides
});

export const addTestConversation = (conversation: Conversation) => {
  testConversations.set(conversation.conversationId, conversation);
};

export const getTestConversations = () => {
  return Array.from(testConversations.values());
};

export const resetConversationStorage = () => {
  testConversations.clear();
  vi.clearAllMocks();
};
