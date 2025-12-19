/**
 * Services barrel export
 * Centralizes all service layer exports
 *
 * Note: Transcription now happens server-side via Cloud Functions.
 * Audio uploads to Firebase Storage trigger the transcribe function.
 */

// Firebase cloud services
export { firestoreService, FirestoreService } from './firestoreService';
export { storageService, StorageService } from './storageService';
