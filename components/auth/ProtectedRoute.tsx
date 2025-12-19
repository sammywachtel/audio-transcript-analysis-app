import React, { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SignInButton } from './SignInButton';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute - Auth gate for protected app sections
 *
 * Shows loading spinner while checking auth state.
 * Shows sign-in prompt if user is not authenticated.
 * Renders children only when user is signed in.
 *
 * This is the single source of truth for "is the user allowed to see this content?"
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  // Still checking auth state - show loading
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Auth state loaded, but no user - show sign-in prompt
  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md w-full mx-4">
          {/* App branding */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Audio Transcript Analysis
            </h1>
            <p className="text-slate-600">
              Transform your audio into interactive, navigable transcripts with AI-powered analysis
            </p>
          </div>

          {/* Sign-in card */}
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Sign in to continue
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Your conversations are stored locally on your device and tied to your Google account
              for security and privacy.
            </p>

            <SignInButton className="w-full flex justify-center" />

            {/* Privacy notice */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-500 text-center">
                By signing in, you agree to store your audio transcripts locally in your browser.
                Your data never leaves your device unless you explicitly enable cloud sync.
              </p>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-white/50 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-2xl mb-2">🎯</div>
              <p className="text-xs font-medium text-slate-700">Speaker Diarization</p>
            </div>
            <div className="bg-white/50 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-2xl mb-2">📝</div>
              <p className="text-xs font-medium text-slate-700">Term Extraction</p>
            </div>
            <div className="bg-white/50 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-2xl mb-2">🔍</div>
              <p className="text-xs font-medium text-slate-700">Topic Segmentation</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated - render protected content
  return <>{children}</>;
};
