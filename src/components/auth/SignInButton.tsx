import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface SignInButtonProps {
  className?: string;
}

/**
 * SignInButton - Google OAuth sign-in trigger
 *
 * Shows a branded Google sign-in button that launches the OAuth popup.
 * Handles loading and error states gracefully.
 *
 * Design follows Google's branding guidelines for sign-in buttons.
 */
export const SignInButton: React.FC<SignInButtonProps> = ({ className = '' }) => {
  const { signInWithGoogle, loading, error } = useAuth();
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      // Error is already handled by AuthContext
      console.error('Sign-in button error:', e);
    } finally {
      setIsSigningIn(false);
    }
  };

  const isLoading = loading || isSigningIn;

  return (
    <div className={className}>
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        className={`
          flex items-center gap-3 px-6 py-3
          bg-white border border-slate-300 rounded-lg
          hover:bg-slate-50 hover:border-slate-400
          active:bg-slate-100
          transition-all duration-200
          shadow-sm hover:shadow
          disabled:opacity-50 disabled:cursor-not-allowed
          font-medium text-slate-700
        `}
      >
        {/* Google Logo SVG */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z"
            fill="#4285F4"
          />
          <path
            d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z"
            fill="#34A853"
          />
          <path
            d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z"
            fill="#FBBC05"
          />
          <path
            d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z"
            fill="#EA4335"
          />
        </svg>

        <span>
          {isLoading ? 'Signing in...' : 'Sign in with Google'}
        </span>
      </button>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-red-600">
          {error.message}
        </p>
      )}
    </div>
  );
};
