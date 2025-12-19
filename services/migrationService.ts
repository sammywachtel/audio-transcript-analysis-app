import { conversationStorage } from './conversationStorage';
import { firestoreService } from './firestoreService';
import { storageService } from './storageService';
import { Conversation } from '../types';

/**
 * Migration status for tracking progress
 */
export interface MigrationProgress {
  total: number;
  completed: number;
  failed: number;
  current: string | null;
  errors: Array<{ conversationId: string; error: string }>;
}

/**
 * MigrationService - Handles migration from IndexedDB to Firestore
 *
 * This is a one-time migration that:
 * 1. Reads all conversations from IndexedDB
 * 2. Uploads audio files to Firebase Storage
 * 3. Saves conversation metadata to Firestore
 * 4. Optionally cleans up IndexedDB after successful migration
 *
 * The migration is idempotent - running it twice won't duplicate data
 * because we use the same conversationId as the document ID.
 */
export class MigrationService {
  /**
   * Check if there's local data that can be migrated
   */
  async hasLocalData(userId: string): Promise<boolean> {
    try {
      const conversations = await conversationStorage.loadAllForUser(userId);
      return conversations.length > 0;
    } catch (error) {
      console.error('[Migration] Failed to check local data:', error);
      return false;
    }
  }

  /**
   * Get count of local conversations
   */
  async getLocalConversationCount(userId: string): Promise<number> {
    try {
      const conversations = await conversationStorage.loadAllForUser(userId);
      return conversations.length;
    } catch (error) {
      console.error('[Migration] Failed to count local data:', error);
      return 0;
    }
  }

  /**
   * Migrate all local conversations to Firestore
   * Returns a progress object that can be used for UI updates
   */
  async migrateToFirestore(
    userId: string,
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationProgress> {
    const progress: MigrationProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      current: null,
      errors: []
    };

    try {
      // Load all local conversations
      const conversations = await conversationStorage.loadAllForUser(userId);
      progress.total = conversations.length;

      console.log('[Migration] Starting migration of', progress.total, 'conversations');
      onProgress?.(progress);

      if (progress.total === 0) {
        console.log('[Migration] No conversations to migrate');
        return progress;
      }

      // Migrate each conversation
      for (const conversation of conversations) {
        progress.current = conversation.title;
        onProgress?.(progress);

        try {
          await this.migrateConversation(conversation, userId);
          progress.completed++;
          console.log('[Migration] Migrated:', conversation.conversationId);
        } catch (error) {
          progress.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          progress.errors.push({
            conversationId: conversation.conversationId,
            error: errorMessage
          });
          console.error('[Migration] Failed to migrate:', conversation.conversationId, error);
        }

        onProgress?.(progress);
      }

      progress.current = null;
      onProgress?.(progress);

      console.log('[Migration] Complete:', {
        total: progress.total,
        completed: progress.completed,
        failed: progress.failed
      });

      return progress;
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Migrate a single conversation
   */
  private async migrateConversation(conversation: Conversation, userId: string): Promise<void> {
    let audioStoragePath: string | undefined;

    // Upload audio if present
    if (conversation.audioUrl) {
      try {
        // Fetch the blob from the IndexedDB-created URL
        const response = await fetch(conversation.audioUrl);
        if (response.ok) {
          const audioBlob = await response.blob();

          // Upload to Firebase Storage
          audioStoragePath = await storageService.uploadAudioBlob(
            userId,
            conversation.conversationId,
            audioBlob,
            `${conversation.conversationId}.mp3`
          );

          console.log('[Migration] Uploaded audio:', audioStoragePath);
        }
      } catch (error) {
        console.warn('[Migration] Failed to upload audio for:', conversation.conversationId, error);
        // Continue without audio - we can still save the transcript
      }
    }

    // Save to Firestore (using the same conversationId maintains idempotency)
    await firestoreService.save(
      {
        ...conversation,
        userId, // Ensure correct userId
        syncStatus: 'synced' as const,
        lastSyncedAt: new Date().toISOString()
      },
      audioStoragePath
    );
  }

  /**
   * Clean up local data after successful migration
   * Only call this after confirming the migration was successful!
   */
  async cleanupLocalData(userId: string): Promise<void> {
    try {
      const conversations = await conversationStorage.loadAllForUser(userId);

      for (const conversation of conversations) {
        await conversationStorage.delete(conversation.conversationId);
      }

      console.log('[Migration] Cleaned up', conversations.length, 'local conversations');
    } catch (error) {
      console.error('[Migration] Failed to clean up local data:', error);
      throw error;
    }
  }

  /**
   * Verify migration by comparing local and cloud counts
   */
  async verifyMigration(userId: string): Promise<{
    localCount: number;
    cloudCount: number;
    isComplete: boolean;
  }> {
    const localConversations = await conversationStorage.loadAllForUser(userId);
    const cloudConversations = await firestoreService.loadAllForUser(userId);

    const localCount = localConversations.length;
    const cloudCount = cloudConversations.length;

    // Check if all local conversations are in the cloud
    const localIds = new Set(localConversations.map(c => c.conversationId));
    const cloudIds = new Set(cloudConversations.map(c => c.conversationId));

    const allMigrated = [...localIds].every(id => cloudIds.has(id));

    return {
      localCount,
      cloudCount,
      isComplete: allMigrated && localCount === 0 || (allMigrated && cloudCount >= localCount)
    };
  }
}

// Export singleton instance
export const migrationService = new MigrationService();
