import { afterEach, vi, beforeAll } from 'vitest';
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
    static credentialFromResult = vi.fn((result: any) => ({
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
vi.mock('../../firebase-config', () => ({
  auth: {},
  googleProvider: {}
}));

// Mock conversation storage to prevent IndexedDB operations
vi.mock('../../services/conversationStorage', async () => {
  const { mockConversationStorage } = await import('./mocks/conversationStorage');
  return {
    conversationStorage: mockConversationStorage
  };
});

// Cleanup after each test - prevents state leakage between tests
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
