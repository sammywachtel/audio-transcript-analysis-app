import { describe, it, expect, beforeEach } from 'vitest';
import {
  mockConversationStorage,
  createTestConversation,
  addTestConversation,
  resetConversationStorage,
  getTestConversations
} from '../mocks/conversationStorage';

/**
 * Data Migration Test Suite
 *
 * Tests orphan conversation migration functionality:
 * - Detection of orphan conversations (no userId or placeholder values)
 * - Migration of orphans to signed-in user
 * - Preservation of conversation data during migration
 * - Edge cases and error handling
 * - Migration count accuracy
 */

describe('Data Migration - Orphan Conversations', () => {
  beforeEach(() => {
    resetConversationStorage();
  });

  describe('Orphan Detection', () => {
    it('should detect conversations without userId as orphans', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(true);
    });

    it('should detect conversations with "anonymous" userId as orphans', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-2',
        userId: 'anonymous'
      }));

      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(true);
    });

    it('should detect conversations with "local" userId as orphans', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-3',
        userId: 'local'
      }));

      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(true);
    });

    it('should not detect conversations with valid userId as orphans', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'owned-1',
        userId: 'user-123'
      }));

      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(false);
    });

    it('should detect orphans when mixed with owned conversations', async () => {
      // Add owned conversation
      addTestConversation(createTestConversation({
        conversationId: 'owned-1',
        userId: 'user-123'
      }));

      // Add orphan
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(true);
    });

    it('should return false when no conversations exist', async () => {
      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(false);
    });
  });

  describe('Migration Execution', () => {
    it('should migrate orphan conversations to specified user', async () => {
      const orphan = createTestConversation({
        conversationId: 'orphan-1',
        userId: '',
        title: 'My Orphan Conversation'
      });
      addTestConversation(orphan);

      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-456');

      expect(migratedCount).toBe(1);

      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1');

      expect(migrated?.userId).toBe('new-user-456');
    });

    it('should migrate multiple orphans at once', async () => {
      // Create 5 orphans with different userId values
      addTestConversation(createTestConversation({ conversationId: 'orphan-1', userId: '' }));
      addTestConversation(createTestConversation({ conversationId: 'orphan-2', userId: 'anonymous' }));
      addTestConversation(createTestConversation({ conversationId: 'orphan-3', userId: 'local' }));
      addTestConversation(createTestConversation({ conversationId: 'orphan-4', userId: '' }));
      addTestConversation(createTestConversation({ conversationId: 'orphan-5', userId: 'anonymous' }));

      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-789');

      expect(migratedCount).toBe(5);

      const conversations = getTestConversations();
      conversations.forEach(conv => {
        expect(conv.userId).toBe('new-user-789');
      });
    });

    it('should not migrate conversations that already have valid userId', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'owned-1',
        userId: 'original-owner-123'
      }));

      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-456');

      expect(migratedCount).toBe(0);

      const conversations = getTestConversations();
      const owned = conversations.find(c => c.conversationId === 'owned-1');

      // Should retain original owner
      expect(owned?.userId).toBe('original-owner-123');
    });

    it('should only migrate orphans, not owned conversations', async () => {
      // Mix of orphans and owned
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));
      addTestConversation(createTestConversation({
        conversationId: 'owned-1',
        userId: 'user-123'
      }));
      addTestConversation(createTestConversation({
        conversationId: 'orphan-2',
        userId: 'anonymous'
      }));

      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-456');

      expect(migratedCount).toBe(2);

      const conversations = getTestConversations();

      const orphan1 = conversations.find(c => c.conversationId === 'orphan-1');
      const orphan2 = conversations.find(c => c.conversationId === 'orphan-2');
      const owned = conversations.find(c => c.conversationId === 'owned-1');

      expect(orphan1?.userId).toBe('new-user-456');
      expect(orphan2?.userId).toBe('new-user-456');
      expect(owned?.userId).toBe('user-123'); // Unchanged
    });
  });

  describe('Data Preservation', () => {
    it('should preserve all conversation data during migration', async () => {
      const originalConversation = createTestConversation({
        conversationId: 'orphan-1',
        userId: '',
        title: 'Important Meeting',
        durationMs: 300000,
        status: 'complete' as const,
        speakers: {
          's1': { speakerId: 's1', displayName: 'Alice', colorIndex: 0 }
        },
        segments: [
          {
            segmentId: 'seg1',
            index: 0,
            speakerId: 's1',
            startMs: 0,
            endMs: 5000,
            text: 'Hello world'
          }
        ],
        terms: {
          't1': {
            termId: 't1',
            key: 'AI',
            display: 'AI',
            definition: 'Artificial Intelligence',
            aliases: ['artificial intelligence']
          }
        },
        termOccurrences: [],
        topics: [],
        people: [
          {
            personId: 'p1',
            name: 'John Doe',
            affiliation: 'Acme Corp',
            userNotes: 'CEO of the company'
          }
        ]
      });

      addTestConversation(originalConversation);

      await mockConversationStorage.migrateOrphanConversations('new-user-999');

      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1')!;

      // Verify all data preserved
      expect(migrated.title).toBe('Important Meeting');
      expect(migrated.durationMs).toBe(300000);
      expect(migrated.status).toBe('complete');
      expect(migrated.speakers.s1.displayName).toBe('Alice');
      expect(migrated.segments).toHaveLength(1);
      expect(migrated.segments[0].text).toBe('Hello world');
      expect(migrated.terms.t1.definition).toBe('Artificial Intelligence');
      expect(migrated.people).toHaveLength(1);
      expect(migrated.people[0].name).toBe('John Doe');
    });

    it('should update updatedAt timestamp during migration', async () => {
      const originalDate = '2024-01-01T00:00:00.000Z';

      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: '',
        updatedAt: originalDate
      }));

      await mockConversationStorage.migrateOrphanConversations('new-user-123');

      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1')!;

      // updatedAt should be newer than original
      expect(new Date(migrated.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalDate).getTime()
      );
    });

    it('should preserve createdAt timestamp during migration', async () => {
      const createdDate = '2024-01-01T12:00:00.000Z';

      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: '',
        createdAt: createdDate
      }));

      await mockConversationStorage.migrateOrphanConversations('new-user-123');

      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1')!;

      // createdAt should remain unchanged
      expect(migrated.createdAt).toBe(createdDate);
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 when no orphans exist', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'owned-1',
        userId: 'user-123'
      }));

      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-456');

      expect(migratedCount).toBe(0);
    });

    it('should return 0 when database is empty', async () => {
      const migratedCount = await mockConversationStorage.migrateOrphanConversations('new-user-456');

      expect(migratedCount).toBe(0);
    });

    it('should handle migration with special characters in userId', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const specialUserId = 'user+123@example.com';
      await mockConversationStorage.migrateOrphanConversations(specialUserId);

      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1');

      expect(migrated?.userId).toBe(specialUserId);
    });

    it('should be idempotent - running twice should not double-migrate', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const firstCount = await mockConversationStorage.migrateOrphanConversations('user-111');
      expect(firstCount).toBe(1);

      // Run migration again with same user
      const secondCount = await mockConversationStorage.migrateOrphanConversations('user-111');
      expect(secondCount).toBe(0);

      // Verify still owned by first user
      const conversations = getTestConversations();
      const migrated = conversations.find(c => c.conversationId === 'orphan-1');
      expect(migrated?.userId).toBe('user-111');
    });

    it('should handle large numbers of orphans efficiently', async () => {
      // Create 100 orphan conversations
      for (let i = 0; i < 100; i++) {
        addTestConversation(createTestConversation({
          conversationId: `orphan-${i}`,
          userId: i % 3 === 0 ? '' : i % 3 === 1 ? 'anonymous' : 'local',
          title: `Orphan ${i}`
        }));
      }

      const startTime = Date.now();
      const migratedCount = await mockConversationStorage.migrateOrphanConversations('user-bulk');
      const duration = Date.now() - startTime;

      expect(migratedCount).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify all migrated
      const conversations = getTestConversations();
      conversations.forEach(conv => {
        expect(conv.userId).toBe('user-bulk');
      });
    });
  });

  describe('Concurrent Migration Safety', () => {
    it('should handle concurrent migration attempts gracefully', async () => {
      // Create orphans
      addTestConversation(createTestConversation({ conversationId: 'orphan-1', userId: '' }));
      addTestConversation(createTestConversation({ conversationId: 'orphan-2', userId: '' }));

      // Simulate concurrent migrations (though only one would win in real IDB)
      const [count1, count2] = await Promise.all([
        mockConversationStorage.migrateOrphanConversations('user-A'),
        mockConversationStorage.migrateOrphanConversations('user-B')
      ]);

      // In our mock, both might succeed, but in real IDB there would be transaction isolation
      // Just verify the operation completes without errors
      expect(count1 + count2).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Migration Workflow Integration', () => {
    it('should follow the typical first-sign-in workflow', async () => {
      // User creates conversations before signing in
      addTestConversation(createTestConversation({
        conversationId: 'before-signin-1',
        userId: '',
        title: 'Pre-auth conversation 1'
      }));
      addTestConversation(createTestConversation({
        conversationId: 'before-signin-2',
        userId: 'anonymous',
        title: 'Pre-auth conversation 2'
      }));

      // Check for orphans
      const hasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(hasOrphans).toBe(true);

      // User signs in
      const newUserId = 'google-user-abc123';

      // Migrate orphans
      const migratedCount = await mockConversationStorage.migrateOrphanConversations(newUserId);
      expect(migratedCount).toBe(2);

      // Verify user can now load their conversations
      const userConversations = await mockConversationStorage.loadAllForUser(newUserId);
      expect(userConversations).toHaveLength(2);

      // Verify no more orphans
      const stillHasOrphans = await mockConversationStorage.hasOrphanConversations();
      expect(stillHasOrphans).toBe(false);
    });
  });
});
