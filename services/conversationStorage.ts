import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Conversation } from '../types';

interface ContextualAppDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation & { audioBlob?: Blob };
    indexes: {
      'by-user': string; // Index for filtering conversations by userId
      'by-updated': string; // Index for sorting by updatedAt
    };
  };
}

const DB_NAME = 'contextual-transcript-app';
const DB_VERSION = 2; // Incremented for schema migration

/**
 * ConversationStorageService - Handles all IndexedDB operations for conversations
 *
 * Centralizes persistence logic so components don't need to know about storage details.
 * Blob URLs are ephemeral session-only constructs, so we store actual Blobs in IDB
 * and recreate URLs on load. This service handles all that nonsense for you.
 */
export class ConversationStorageService {
  private dbPromise: Promise<IDBPDatabase<ContextualAppDB>> | null = null;

  private async getDB(): Promise<IDBPDatabase<ContextualAppDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<ContextualAppDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          let store;

          // Initial creation (v0 -> v1)
          if (!db.objectStoreNames.contains('conversations')) {
            store = db.createObjectStore('conversations', { keyPath: 'conversationId' });
          }

          // Migration from v1 -> v2: Add indexes for multi-user support
          if (oldVersion < 2) {
            // Get the store from the versionchange transaction
            if (!store) {
              store = transaction.objectStore('conversations');
            }

            // Create indexes if they don't exist
            if (!store.indexNames.contains('by-user')) {
              store.createIndex('by-user', 'userId', { unique: false });
            }
            if (!store.indexNames.contains('by-updated')) {
              store.createIndex('by-updated', 'updatedAt', { unique: false });
            }
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Save a conversation to IndexedDB
   * Fetches the audio blob from the URL before storing (since blob URLs expire)
   */
  async save(conversation: Conversation): Promise<void> {
    const db = await this.getDB();

    let audioBlob: Blob | undefined;

    console.log('[Storage] Saving conversation:', {
      id: conversation.conversationId,
      hasAudioUrl: !!conversation.audioUrl,
      audioUrlPrefix: conversation.audioUrl?.substring(0, 30)
    });

    // If we have a blob URL, fetch the actual blob data
    if (conversation.audioUrl && conversation.audioUrl.startsWith('blob:')) {
      try {
        console.log('[Storage] Fetching blob from URL...');
        const response = await fetch(conversation.audioUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        audioBlob = await response.blob();
        console.log('[Storage] Blob fetched successfully:', {
          size: audioBlob.size,
          type: audioBlob.type
        });
      } catch (e) {
        console.warn("[Storage] Could not fetch blob from URL for saving. Attempting to preserve existing blob if update.", e);
        // Fallback: Preserve existing blob if this is an update operation
        const existing = await db.get('conversations', conversation.conversationId);
        if (existing && existing.audioBlob) {
          audioBlob = existing.audioBlob;
          console.log('[Storage] Using existing blob from previous save');
        } else {
          console.warn('[Storage] No existing blob found - audio will be lost!');
        }
      }
    } else {
      console.log('[Storage] No blob URL to fetch (audioUrl missing or not a blob URL)');
    }

    // Store without the ephemeral URL, but with the permanent Blob
    const { audioUrl, ...rest } = conversation;
    const itemToStore = {
      ...rest,
      audioBlob
    };

    await db.put('conversations', itemToStore);
  }

  /**
   * Load all conversations from IndexedDB
   * Recreates blob URLs from stored Blobs for the current session
   */
  async loadAll(): Promise<Conversation[]> {
    const db = await this.getDB();
    const items = await db.getAll('conversations');

    console.log('[Storage] Loading all conversations:', { count: items.length });

    // Sort by newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return items.map(item => {
      const { audioBlob, ...rest } = item;
      let audioUrl: string | undefined;

      // Recreate the Blob URL for this session
      if (audioBlob) {
        audioUrl = URL.createObjectURL(audioBlob);
        console.log('[Storage] Recreated blob URL for:', {
          id: item.conversationId,
          blobSize: audioBlob.size,
          blobType: audioBlob.type,
          newUrl: audioUrl.substring(0, 50)
        });
      } else {
        console.warn('[Storage] No audio blob stored for:', item.conversationId);
      }

      return {
        ...rest,
        people: item.people || [], // Migration safety for older records
        audioUrl
      } as Conversation;
    });
  }

  /**
   * Load a single conversation by ID
   */
  async loadById(id: string): Promise<Conversation | null> {
    const db = await this.getDB();
    const item = await db.get('conversations', id);

    if (!item) return null;

    const { audioBlob, ...rest } = item;
    let audioUrl: string | undefined;

    if (audioBlob) {
      audioUrl = URL.createObjectURL(audioBlob);
    }

    return {
      ...rest,
      people: item.people || [],
      audioUrl
    } as Conversation;
  }

  /**
   * Delete a conversation by ID
   */
  async delete(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('conversations', id);
  }

  /**
   * Clear all conversations (useful for testing/debugging)
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();
    await db.clear('conversations');
  }

  /**
   * Load conversations for a specific user
   * Filters by userId using the by-user index for performance
   */
  async loadAllForUser(userId: string): Promise<Conversation[]> {
    const db = await this.getDB();
    const tx = db.transaction('conversations', 'readonly');
    const index = tx.objectStore('conversations').index('by-user');

    const items = await index.getAll(userId);

    console.log('[Storage] Loading conversations for user:', { userId, count: items.length });

    // Sort by newest first (updatedAt or createdAt)
    items.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    return items.map(item => {
      const { audioBlob, ...rest } = item;
      let audioUrl: string | undefined;

      if (audioBlob) {
        audioUrl = URL.createObjectURL(audioBlob);
      }

      return {
        ...rest,
        people: item.people || [],
        audioUrl
      } as Conversation;
    });
  }

  /**
   * Migrate orphan conversations (without userId) to belong to a user
   * Called on first sign-in to claim existing local data
   *
   * Returns the number of conversations migrated
   */
  async migrateOrphanConversations(userId: string): Promise<number> {
    const db = await this.getDB();
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');

    let migratedCount = 0;
    let cursor = await store.openCursor();

    console.log('[Storage] Starting orphan conversation migration for user:', userId);

    while (cursor) {
      const conversation = cursor.value;

      // If conversation has no userId or has a placeholder userId, claim it
      if (!conversation.userId || conversation.userId === 'anonymous' || conversation.userId === 'local') {
        const updated = {
          ...conversation,
          userId,
          updatedAt: conversation.updatedAt || new Date().toISOString()
        };

        await cursor.update(updated);
        migratedCount++;

        console.log('[Storage] Migrated conversation:', {
          id: conversation.conversationId,
          title: conversation.title,
          oldUserId: conversation.userId,
          newUserId: userId
        });
      }

      cursor = await cursor.continue();
    }

    await tx.done;

    console.log('[Storage] Migration complete:', { migratedCount });
    return migratedCount;
  }

  /**
   * Check if there are any orphan conversations that need migration
   */
  async hasOrphanConversations(): Promise<boolean> {
    const db = await this.getDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');

    let cursor = await store.openCursor();

    while (cursor) {
      const conversation = cursor.value;
      if (!conversation.userId || conversation.userId === 'anonymous' || conversation.userId === 'local') {
        return true;
      }
      cursor = await cursor.continue();
    }

    return false;
  }
}

// Export a singleton instance
export const conversationStorage = new ConversationStorageService();
