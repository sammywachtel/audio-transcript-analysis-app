/**
 * Services barrel export
 * Centralizes all service layer exports
 */

// Local storage (IndexedDB)
export { conversationStorage, ConversationStorageService } from './conversationStorage';

// Transcription
export { transcriptionService, createTranscriptionService, TranscriptionService } from './transcriptionService';

// Firebase cloud services
export { firestoreService, FirestoreService } from './firestoreService';
export { storageService, StorageService } from './storageService';

// Migration utilities
export { migrationService, MigrationService } from './migrationService';
export type { MigrationProgress } from './migrationService';
