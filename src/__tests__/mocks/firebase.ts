import { vi } from 'vitest';
import type { User } from 'firebase/auth';

/**
 * Firebase Auth Mocks
 *
 * These mocks simulate Firebase authentication behavior without hitting real servers.
 * Designed to be fast, deterministic, and easy to manipulate in tests.
 */

// Mock Firebase Auth User
export const createMockUser = (overrides?: Partial<User>): User => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  phoneNumber: null,
  isAnonymous: false,
  tenantId: null,
  metadata: {
    creationTime: new Date().toISOString(),
    lastSignInTime: new Date().toISOString()
  },
  providerData: [
    {
      providerId: 'google.com',
      uid: 'google-uid-123',
      displayName: 'Test User',
      email: 'test@example.com',
      phoneNumber: null,
      photoURL: 'https://example.com/photo.jpg'
    }
  ],
  refreshToken: 'mock-refresh-token',
  // Methods that exist on User interface
  delete: vi.fn().mockResolvedValue(undefined),
  getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
  getIdTokenResult: vi.fn().mockResolvedValue({
    token: 'mock-id-token',
    expirationTime: new Date(Date.now() + 3600000).toISOString(),
    authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(),
    signInProvider: 'google.com',
    signInSecondFactor: null,
    claims: {}
  }),
  reload: vi.fn().mockResolvedValue(undefined),
  toJSON: vi.fn().mockReturnValue({}),
  ...overrides
} as User);

// Mock auth state observer - can be controlled in tests
let currentUser: User | null = null;
const authStateListeners: Array<(user: User | null) => void> = [];

export const mockFirebaseAuth = {
  get currentUser() {
    return currentUser;
  },

  // Simulate auth state changes
  onAuthStateChanged: vi.fn((
    _auth: any,
    callback: (user: User | null) => void,
    errorCallback?: (error: Error) => void
  ) => {
    authStateListeners.push(callback);

    // Immediately call with current state (mimics Firebase behavior)
    // Use queueMicrotask for more reliable async behavior
    queueMicrotask(() => callback(currentUser));

    // Return unsubscribe function
    return () => {
      const index = authStateListeners.indexOf(callback);
      if (index > -1) {
        authStateListeners.splice(index, 1);
      }
    };
  }),

  // Simulate sign in
  signInWithPopup: vi.fn(async (_auth: any, _provider: any) => {
    const user = createMockUser();
    currentUser = user;

    // Notify all listeners (async to mimic real behavior)
    queueMicrotask(() => {
      authStateListeners.forEach(listener => listener(user));
    });

    return {
      user,
      providerId: 'google.com',
      operationType: 'signIn'
    };
  }),

  // Simulate sign out
  signOut: vi.fn(async (_auth: any) => {
    currentUser = null;

    // Notify all listeners
    queueMicrotask(() => {
      authStateListeners.forEach(listener => listener(null));
    });
  }),

  // Google Auth Provider mock
  GoogleAuthProvider: {
    credentialFromResult: vi.fn(() => ({
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
      providerId: 'google.com'
    }))
  }
};

// Helper to simulate auth state changes in tests
export const setMockAuthState = (user: User | null) => {
  currentUser = user;
  authStateListeners.forEach(listener => listener(user));
};

// Helper to simulate auth errors
export const createAuthError = (code: string, message: string) => {
  const error = new Error(message) as any;
  error.code = code;
  return error;
};

// Reset auth state between tests
export const resetAuthMocks = () => {
  currentUser = null;
  authStateListeners.length = 0;
  vi.clearAllMocks();
};
