import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase-config';
import { conversationStorage } from '../services/conversationStorage';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider - Manages Firebase authentication state
 *
 * Handles:
 * - Google OAuth sign-in via popup
 * - Session persistence and restoration
 * - Auto-migration of orphan conversations on first sign-in
 * - Cross-tab auth state synchronization
 *
 * The Firebase SDK automatically refreshes tokens and syncs auth state
 * across browser tabs. We just need to listen and react.
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log('[Auth] Setting up auth state listener');

    // Listen for auth state changes (login, logout, token refresh, cross-tab sync)
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        console.log('[Auth] Auth state changed:', {
          isSignedIn: !!firebaseUser,
          uid: firebaseUser?.uid,
          email: firebaseUser?.email
        });

        // Check if this is a new sign-in (user was null, now has value)
        const isNewSignIn = !user && !!firebaseUser;

        setUser(firebaseUser);
        setLoading(false);

        // On first sign-in, migrate any orphan conversations to this user
        if (isNewSignIn && firebaseUser) {
          try {
            const hasOrphans = await conversationStorage.hasOrphanConversations();

            if (hasOrphans) {
              console.log('[Auth] Found orphan conversations, starting migration...');
              const migratedCount = await conversationStorage.migrateOrphanConversations(
                firebaseUser.uid
              );

              if (migratedCount > 0) {
                console.log(`[Auth] Successfully migrated ${migratedCount} conversation(s) to user ${firebaseUser.uid}`);
                // Could show a toast notification here: "Migrated X conversations to your account"
              }
            } else {
              console.log('[Auth] No orphan conversations to migrate');
            }
          } catch (e) {
            console.error('[Auth] Failed to migrate orphan conversations:', e);
            // Non-fatal error - user can still proceed
          }
        }
      },
      (err) => {
        console.error('[Auth] Auth state observer error:', err);
        setError(err);
        setLoading(false);
      }
    );

    // Clean up listener on unmount
    return () => {
      console.log('[Auth] Cleaning up auth state listener');
      unsubscribe();
    };
  }, [user]); // Depend on user to detect new sign-ins

  /**
   * Sign in with Google using popup flow
   * Alternative: signInWithRedirect for mobile or when popups are blocked
   */
  const signInWithGoogle = async () => {
    setError(null);

    try {
      console.log('[Auth] Starting Google sign-in...');

      const result = await signInWithPopup(auth, googleProvider);

      // Get additional OAuth tokens if needed (for future Google API calls)
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      console.log('[Auth] Sign-in successful:', {
        uid: result.user.uid,
        email: result.user.email,
        hasAccessToken: !!accessToken
      });

      // User state will be updated automatically via onAuthStateChanged
    } catch (e) {
      console.error('[Auth] Sign-in failed:', e);

      const errorCode = (e as any)?.code;
      let errorMessage = 'Failed to sign in with Google';

      // Provide user-friendly error messages
      switch (errorCode) {
        case 'auth/popup-blocked':
          errorMessage = 'Sign-in popup was blocked. Please allow popups for this site.';
          break;
        case 'auth/popup-closed-by-user':
          errorMessage = 'Sign-in cancelled';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection and try again.';
          break;
        case 'auth/unauthorized-domain':
          errorMessage = 'This domain is not authorized for sign-in. Please contact support.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Google sign-in is not enabled. Please contact support.';
          break;
        default:
          // Use Firebase error message if available
          errorMessage = (e as Error)?.message || errorMessage;
      }

      const authError = new Error(errorMessage);
      setError(authError);
      throw authError;
    }
  };

  /**
   * Sign out the current user
   * Note: Does NOT delete local conversations - they remain in IndexedDB
   */
  const signOut = async () => {
    try {
      console.log('[Auth] Signing out user:', user?.uid);
      await firebaseSignOut(auth);
      console.log('[Auth] Sign-out successful');
      // User state will be updated automatically via onAuthStateChanged
    } catch (e) {
      console.error('[Auth] Sign-out failed:', e);
      const authError = e instanceof Error ? e : new Error('Failed to sign out');
      setError(authError);
      throw authError;
    }
  };

  /**
   * Clear the current error state
   */
  const clearError = () => {
    setError(null);
  };

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signInWithGoogle,
    signOut,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth - Hook to access auth context
 * Throws if used outside AuthProvider
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
