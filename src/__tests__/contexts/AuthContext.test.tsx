import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../contexts/AuthContext';
import {
  mockFirebaseAuth,
  createMockUser,
  setMockAuthState,
  createAuthError,
  resetAuthMocks
} from '../mocks/firebase';

/**
 * AuthContext Test Suite
 *
 * Tests the authentication context provider including:
 * - Initial auth state loading
 * - Google sign-in flow
 * - Sign-out flow
 * - Session persistence and restoration
 * - Error handling
 * - Cross-tab sync simulation
 */

describe('AuthContext', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State and Loading', () => {
    it('should start with loading=true and user=null', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Initial state before auth check completes
      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it('should set loading=false after initial auth check', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for initial auth state to resolve
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBe(null);
    });

    it('should restore existing session on mount', async () => {
      const mockUser = createMockUser();

      // Simulate existing auth session
      setMockAuthState(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.user?.uid).toBe('test-user-123');
      expect(result.current.user?.email).toBe('test@example.com');
    });
  });

  describe('Sign-In with Google', () => {
    it('should successfully sign in with Google', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Trigger sign-in
      await act(async () => {
        await result.current.signInWithGoogle();
      });

      // Verify sign-in succeeded
      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user?.uid).toBe('test-user-123');
      expect(result.current.user?.email).toBe('test@example.com');
      expect(result.current.error).toBe(null);
      expect(mockFirebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
    });

    it('should clear previous errors on new sign-in attempt', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set an error state
      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-blocked', 'Popup blocked')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected to fail
        }
      });

      expect(result.current.error).not.toBe(null);

      // Mock success for retry
      mockFirebaseAuth.signInWithPopup.mockResolvedValueOnce({
        user: createMockUser(),
        providerId: 'google.com',
        operationType: 'signIn'
      });

      // Retry sign-in - error should be cleared
      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('Sign-Out', () => {
    it('should successfully sign out', async () => {
      // Start signed in
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Sign out
      await act(async () => {
        await result.current.signOut();
      });

      await waitFor(() => {
        expect(result.current.user).toBe(null);
      });

      expect(mockFirebaseAuth.signOut).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(null);
    });

    it('should handle sign-out errors', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Simulate sign-out failure
      const signOutError = new Error('Network error');
      mockFirebaseAuth.signOut.mockRejectedValueOnce(signOutError);

      // Attempt sign-out
      await act(async () => {
        try {
          await result.current.signOut();
        } catch (e) {
          expect(e).toEqual(signOutError);
        }
      });

      // Error should be set
      expect(result.current.error).not.toBe(null);
      expect(result.current.error?.message).toBe('Network error');
    });
  });

  describe('Error Handling', () => {
    it('should handle popup blocked error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-blocked', 'Popup blocked')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('popup was blocked');
    });

    it('should handle popup closed by user', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-closed-by-user', 'User closed popup')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('cancelled');
    });

    it('should handle network errors', async () => {
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
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('Network error');
      expect(result.current.error?.message).toContain('connection');
    });

    it('should handle unauthorized domain error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/unauthorized-domain', 'Domain not authorized')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('not authorized');
    });

    it('should handle operation not allowed error', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/operation-not-allowed', 'Operation not allowed')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('not enabled');
    });

    it('should provide generic error message for unknown errors', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/unknown-error', 'Something weird happened')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toBeTruthy();
    });

    it('should clear error with clearError()', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Generate an error
      mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
        createAuthError('auth/popup-blocked', 'Popup blocked')
      );

      await act(async () => {
        try {
          await result.current.signInWithGoogle();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('Session Persistence', () => {
    it('should maintain auth state across re-renders', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const { result, rerender } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      const firstUserId = result.current.user?.uid;

      // Force re-render
      rerender();

      // User should still be the same
      expect(result.current.user?.uid).toBe(firstUserId);
    });

    it('should handle auth state observer errors', async () => {
      // This test verifies the error callback in onAuthStateChanged
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock auth state observer to trigger error callback
      mockFirebaseAuth.onAuthStateChanged.mockImplementationOnce(
        (_auth: any, _callback: any, errorCallback?: (error: Error) => void) => {
          if (errorCallback) {
            setTimeout(() => errorCallback(new Error('Auth observer error')), 0);
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
  });

  describe('Cross-Tab Synchronization', () => {
    it('should sync auth state when another tab signs in', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBe(null);

      // Simulate another tab signing in
      const mockUser = createMockUser();
      act(() => {
        setMockAuthState(mockUser);
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user?.uid).toBe('test-user-123');
    });

    it('should sync auth state when another tab signs out', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Simulate another tab signing out
      act(() => {
        setMockAuthState(null);
      });

      await waitFor(() => {
        expect(result.current.user).toBe(null);
      });
    });
  });

  describe('Hook Usage Rules', () => {
    it('should throw error when useAuth is used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within AuthProvider');

      consoleErrorSpy.mockRestore();
    });
  });
});
