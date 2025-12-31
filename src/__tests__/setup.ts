import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock Firebase modules before any imports
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApp: vi.fn(() => ({}))
}));

vi.mock('firebase/auth', async () => {
  const { mockFirebaseAuth } = await import('./mocks/firebase');

  class GoogleAuthProvider {
    // Instance methods that firebase-config.ts calls
    addScope = vi.fn(() => this);
    setCustomParameters = vi.fn(() => this);

    static credentialFromResult = vi.fn((_result: any) => ({
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
      providerId: 'google.com'
    }));
  }

  return {
    ...mockFirebaseAuth,
    getAuth: vi.fn(() => ({})),
    GoogleAuthProvider,
    onAuthStateChanged: mockFirebaseAuth.onAuthStateChanged,
    signInWithPopup: mockFirebaseAuth.signInWithPopup,
    signOut: mockFirebaseAuth.signOut
  };
});

// Mock firebase-config to prevent initialization errors
vi.mock('@/config/firebase-config', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  storage: {},
  functions: {}
}));

// Mock Firestore service
vi.mock('@/services/firestoreService', () => ({
  firestoreService: {
    subscribeToUserConversations: vi.fn(() => () => {}), // Returns unsubscribe function
    save: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn()
  },
  FirestoreService: vi.fn()
}));

// Mock Storage service
vi.mock('@/services/storageService', () => ({
  storageService: {
    uploadAudio: vi.fn(),
    getAudioUrl: vi.fn(),
    deleteAudio: vi.fn()
  },
  StorageService: vi.fn()
}));

// Cleanup after each test - prevents state leakage between tests
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
