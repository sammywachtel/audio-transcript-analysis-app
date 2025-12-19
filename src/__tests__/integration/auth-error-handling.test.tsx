import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../contexts/AuthContext';
import {
  mockFirebaseAuth,
  createAuthError,
  resetAuthMocks,
  createMockUser
} from '../mocks/firebase';
import {
  mockConversationStorage,
  resetConversationStorage,
  addTestConversation,
  createTestConversation
} from '../mocks/conversationStorage';

/**
 * Auth Error Handling Test Suite
 *
 * Comprehensive testing of error scenarios:
 * - Firebase auth errors (network, permissions, etc.)
 * - Migration errors
 * - State recovery after errors
 * - User-facing error messages
 * - Edge cases and race conditions
 */

describe('Auth Error Handling', () => {
  beforeEach(() => {
    resetAuthMocks();
    resetConversationStorage();
  });

  describe('Firebase Authentication Errors', () => {
    it('should handle popup blocked error gracefully', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-blocked', 'Popup blocked by browser')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain('popup was blocked');
      expect(result.current.error?.message).toContain('allow popups');
    });

    it('should handle popup closed by user without crashing', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-closed-by-user', 'User closed the popup')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toContain('cancelled');
      expect(result.current.user).toBe(null);
    });

    it('should provide helpful message for network errors', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/network-request-failed', 'Network error')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toContain('Network error');
      expect(result.current.error?.message).toContain('connection');
      expect(result.current.error?.message).toContain('try again');
    });

    it('should handle unauthorized domain error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/unauthorized-domain', 'Domain not whitelisted')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toContain('not authorized');
      expect(result.current.error?.message).toContain('contact support');
    });

    it('should handle disabled auth provider error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/operation-not-allowed', 'Google sign-in not enabled')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toContain('not enabled');
      expect(result.current.error?.message).toContain('contact support');
    });

    it('should handle account exists with different credential', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError(
          'auth/account-exists-with-different-credential',
          'Account exists with different provider'
        )
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toBeTruthy();
    });

    it('should handle too many requests error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/too-many-requests', 'Too many attempts')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toBeTruthy();
    });

    it('should provide generic error for unknown error codes', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/unknown-weird-error', 'Something strange happened')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error?.message).toBeTruthy();
      // Should include the original Firebase error message
      expect(result.current.error?.message).toContain('Something strange happened');
    });
  });

  describe('Sign-Out Errors', () => {
    it('should handle sign-out network errors', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Sign in first
      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Mock sign-out error
      mockFirebaseAuth.signOut.mockRejectedValueOnce(
        new Error('Network error during sign-out')
      );

      await act(async () => {
        await expect(result.current.signOut()).rejects.toThrow();
      });

      expect(result.current.error?.message).toContain('Network error');
    });

    it('should handle sign-out when already signed out', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Try to sign out when not signed in
      await act(async () => {
        await result.current.signOut();
      });

      // Should complete without error
      expect(result.current.error).toBe(null);
      expect(result.current.user).toBe(null);
    });
  });

  describe('Migration Errors', () => {
    it('should continue sign-in even if migration check fails', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock migration check failure
      mockConversationStorage.hasOrphanConversations.mockRejectedValueOnce(
        new Error('Database connection error')
      );

      // Sign-in should still succeed
      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // User should be signed in despite migration error
      expect(result.current.user?.uid).toBe('test-user-123');
      expect(result.current.error).toBe(null); // Migration errors are non-fatal
    });

    it('should continue sign-in even if migration execution fails', async () => {
      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock migration failure
      mockConversationStorage.hasOrphanConversations.mockResolvedValueOnce(true);
      mockConversationStorage.migrateOrphanConversations.mockRejectedValueOnce(
        new Error('Failed to migrate: database locked')
      );

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Sign-in succeeds even though migration failed
      expect(result.current.user?.uid).toBe('test-user-123');
      expect(result.current.error).toBe(null);
    });

    it('should log migration errors without exposing to user', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      addTestConversation(createTestConversation({
        conversationId: 'orphan-1',
        userId: ''
      }));

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockConversationStorage.hasOrphanConversations.mockResolvedValueOnce(true);
      mockConversationStorage.migrateOrphanConversations.mockRejectedValueOnce(
        new Error('Migration error')
      );

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to migrate'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Auth State Observer Errors', () => {
    it('should handle auth state observer errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock observer error
      mockFirebaseAuth.onAuthStateChanged.mockImplementationOnce(
        (_auth: any, _callback: any, errorCallback?: (error: Error) => void) => {
          if (errorCallback) {
            setTimeout(() => errorCallback(new Error('Auth observer failed')), 0);
          }
          return () => {};
        }
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should set loading=false even when observer errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFirebaseAuth.onAuthStateChanged.mockImplementationOnce(
        (_auth: any, _callback: any, errorCallback?: (error: Error) => void) => {
          if (errorCallback) {
            setTimeout(() => errorCallback(new Error('Observer error')), 0);
          }
          return () => {};
        }
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not be stuck in loading state
      expect(result.current.loading).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Recovery', () => {
    it('should allow retry after sign-in error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First attempt fails
      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/network-request-failed', 'Network error')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error).not.toBe(null);

      // Second attempt succeeds
      mockFirebaseAuth.signInWithPopup.mockResolvedValueOnce({
        user: createMockUser(),
        providerId: 'google.com',
        operationType: 'signIn'
      });

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Error should be cleared
      expect(result.current.error).toBe(null);
    });

    it('should clear error manually with clearError()', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Generate error
      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-blocked', 'Popup blocked')
      );

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      expect(result.current.error).not.toBe(null);

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });

    it('should maintain user state after non-fatal errors', async () => {
      const mockUser = createMockUser();

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Sign in successfully
      await act(async () => {
        await result.current.signInWithGoogle();
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      const userId = result.current.user?.uid;

      // Some operation fails (like migration)
      mockConversationStorage.hasOrphanConversations.mockRejectedValueOnce(
        new Error('Database error')
      );

      // User should still be signed in
      expect(result.current.user?.uid).toBe(userId);
    });
  });

  describe('Error Message Quality', () => {
    it('should provide actionable error messages', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const errorTests = [
        {
          code: 'auth/popup-blocked',
          expectedPhrases: ['popup', 'blocked', 'allow']
        },
        {
          code: 'auth/network-request-failed',
          expectedPhrases: ['network', 'connection', 'try again']
        },
        {
          code: 'auth/unauthorized-domain',
          expectedPhrases: ['not authorized', 'contact support']
        }
      ];

      for (const test of errorTests) {
        mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
          createAuthError(test.code, 'Error')
        );

        await act(async () => {
          await expect(result.current.signInWithGoogle()).rejects.toThrow();
        });

        const errorMessage = result.current.error?.message.toLowerCase();

        test.expectedPhrases.forEach(phrase => {
          expect(errorMessage).toContain(phrase.toLowerCase());
        });

        // Clear for next test
        act(() => {
          result.current.clearError();
        });
      }
    });

    it('should not expose technical stack traces to users', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const technicalError = new Error('Internal error: Stack trace...\n  at firebase.auth...');
      (technicalError as any).code = 'auth/internal-error';

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(technicalError);

      await act(async () => {
        await expect(result.current.signInWithGoogle()).rejects.toThrow();
      });

      // Should have error message but not full stack trace
      expect(result.current.error?.message).toBeTruthy();
      expect(result.current.error?.message).not.toContain('Stack trace');
    });
  });

  describe('Concurrent Operation Errors', () => {
    it('should handle multiple concurrent sign-in attempts', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Attempt multiple sign-ins concurrently
      const promises = Promise.all([
        act(() => result.current.signInWithGoogle()),
        act(() => result.current.signInWithGoogle()),
        act(() => result.current.signInWithGoogle())
      ]);

      await promises;

      // Should complete without crashing
      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });
    });

    it('should handle sign-in during existing sign-in', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start first sign-in (make it slow)
      let resolveFirstSignIn: any;
      const slowSignInPromise = new Promise(resolve => {
        resolveFirstSignIn = resolve;
      });

      mockFirebaseAuth.signInWithPopup.mockImplementationOnce(async () => {
        await slowSignInPromise;
        return {
          user: createMockUser(),
          providerId: 'google.com',
          operationType: 'signIn'
        };
      });

      const firstSignIn = act(() => result.current.signInWithGoogle());

      // Start second sign-in while first is pending
      mockFirebaseAuth.signInWithPopup.mockResolvedValueOnce({
        user: createMockUser(),
        providerId: 'google.com',
        operationType: 'signIn'
      });

      const secondSignIn = act(() => result.current.signInWithGoogle());

      // Complete first sign-in
      resolveFirstSignIn();

      await Promise.all([firstSignIn, secondSignIn]);

      // Should complete without error
      expect(result.current.user).not.toBe(null);
    });
  });
});
