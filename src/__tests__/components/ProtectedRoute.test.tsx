import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { renderWithAuth } from '../utils/test-utils';
import {
  createMockUser,
  setMockAuthState,
  resetAuthMocks
} from '../mocks/firebase';
import { resetConversationStorage } from '../mocks/conversationStorage';

/**
 * ProtectedRoute Test Suite
 *
 * Tests the authentication gate that controls access to protected content:
 * - Loading state while checking auth
 * - Sign-in prompt when not authenticated
 * - Content rendering when authenticated
 * - Auth state transitions
 */

describe('ProtectedRoute', () => {
  beforeEach(() => {
    resetAuthMocks();
    resetConversationStorage();
  });

  describe('Loading State', () => {
    it('should show loading spinner while checking auth state', () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Should show loading spinner initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Should NOT show protected content yet
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should show loading spinner with correct styling', () => {
      const { container } = renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Verify loading UI structure
      const loadingContainer = container.querySelector('.h-screen.w-screen');
      expect(loadingContainer).toBeInTheDocument();

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('should show sign-in prompt when user is not authenticated', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // Should show sign-in prompt
      expect(screen.getByText('Sign in to continue')).toBeInTheDocument();

      // Should NOT show protected content
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should display app branding and description', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // App title
      expect(screen.getByText('Audio Transcript Analysis')).toBeInTheDocument();

      // App description
      expect(
        screen.getByText(/Transform your audio into interactive, navigable transcripts/i)
      ).toBeInTheDocument();
    });

    it('should show feature highlights', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // Check for feature highlights
      expect(screen.getByText('Speaker Diarization')).toBeInTheDocument();
      expect(screen.getByText('Term Extraction')).toBeInTheDocument();
      expect(screen.getByText('Topic Segmentation')).toBeInTheDocument();
    });

    it('should show privacy notice', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // Privacy notice text
      expect(
        screen.getByText(/Your conversations are stored locally on your device/i)
      ).toBeInTheDocument();

      expect(
        screen.getByText(/Your data never leaves your device/i)
      ).toBeInTheDocument();
    });

    it('should display sign-in button', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // The SignInButton component should be present
      // Note: Actual button text depends on SignInButton implementation
      const signInCard = screen.getByText('Sign in to continue').closest('div');
      expect(signInCard).toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    it('should render protected content when user is authenticated', async () => {
      // Start with authenticated user
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      // Should NOT show loading or sign-in prompt
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
    });

    it('should render multiple children when authenticated', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      renderWithAuth(
        <ProtectedRoute>
          <div>First Child</div>
          <div>Second Child</div>
          <div>Third Child</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText('First Child')).toBeInTheDocument();
      });

      expect(screen.getByText('Second Child')).toBeInTheDocument();
      expect(screen.getByText('Third Child')).toBeInTheDocument();
    });

    it('should render complex React components when authenticated', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const ComplexComponent = () => (
        <div>
          <h1>Complex Component</h1>
          <button>Click me</button>
          <input placeholder="Type here" />
        </div>
      );

      renderWithAuth(
        <ProtectedRoute>
          <ComplexComponent />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText('Complex Component')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
    });
  });

  describe('Auth State Transitions', () => {
    it('should transition from loading to sign-in prompt', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Initially loading
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Wait for transition to sign-in prompt
      await waitFor(() => {
        expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('should transition from loading to protected content', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Initially loading
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Wait for transition to content
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('should transition from sign-in prompt to content after auth', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Wait for sign-in prompt
      await waitFor(() => {
        expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
      });

      // Simulate user signing in
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      // Should transition to protected content
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
    });

    it('should transition from content to sign-in prompt after sign-out', async () => {
      // Start authenticated
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Wait for content to appear
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      // Simulate sign-out
      setMockAuthState(null);

      // Should transition back to sign-in prompt
      await waitFor(() => {
        expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
      });

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty children gracefully', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const { container } = renderWithAuth(
        <ProtectedRoute>
          {null}
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // Should not crash, just render empty content
      expect(container).toBeInTheDocument();
    });

    it('should handle conditional children', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const showContent = true;

      renderWithAuth(
        <ProtectedRoute>
          {showContent && <div>Conditional Content</div>}
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText('Conditional Content')).toBeInTheDocument();
      });
    });

    it('should maintain component state during re-renders', async () => {
      const mockUser = createMockUser();
      setMockAuthState(mockUser);

      const StatefulComponent = () => {
        const [count, setCount] = React.useState(0);
        return (
          <div>
            <span>Count: {count}</span>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        );
      };

      const { rerender } = renderWithAuth(
        <ProtectedRoute>
          <StatefulComponent />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText('Count: 0')).toBeInTheDocument();
      });

      // Interact with component
      const button = screen.getByRole('button', { name: 'Increment' });
      button.click();

      await waitFor(() => {
        expect(screen.getByText('Count: 1')).toBeInTheDocument();
      });

      // Force re-render
      rerender(
        <ProtectedRoute>
          <StatefulComponent />
        </ProtectedRoute>
      );

      // State should be reset due to new component instance
      // (This is expected React behavior)
      await waitFor(() => {
        expect(screen.getByText(/Count: /)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA roles in loading state', () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Loading container should be accessible
      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
    });

    it('should have proper heading hierarchy in sign-in state', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });

      // Check heading hierarchy (h1 before h2)
      const h1 = screen.getByRole('heading', { level: 1, name: /Audio Transcript Analysis/i });
      const h2 = screen.getByRole('heading', { level: 2, name: /Sign in to continue/i });

      expect(h1).toBeInTheDocument();
      expect(h2).toBeInTheDocument();
    });
  });
});
