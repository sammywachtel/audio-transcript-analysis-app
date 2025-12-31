import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AuthProvider } from '@/contexts/AuthContext';

/**
 * Test Utilities - Custom render functions and helpers
 *
 * Reduces boilerplate in tests by providing pre-configured wrappers.
 * Firebase and storage mocks are configured globally in setup.ts
 */

/**
 * Custom render function that wraps components with AuthProvider
 * Use this for components that need auth context
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  withAuth?: boolean;
}

export const renderWithAuth = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  const { withAuth = true, ...renderOptions } = options || {};

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    if (withAuth) {
      return <AuthProvider>{children}</AuthProvider>;
    }
    return <>{children}</>;
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

/**
 * Wait for async operations to complete
 * Useful for waiting after auth state changes
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Create a mock audio blob for testing
 */
export const createMockAudioBlob = (): Blob => {
  return new Blob(['fake audio data'], { type: 'audio/mp3' });
};

/**
 * Create a mock blob URL
 */
export const createMockBlobUrl = (): string => {
  return `blob:http://localhost:3000/${Math.random()}`;
};

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
