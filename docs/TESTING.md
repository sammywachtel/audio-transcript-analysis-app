# Testing Guide - Audio Transcript Analysis App

Quick reference for running and writing tests for the authentication system.

## Quick Start

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run

# Generate coverage report
npm run test:coverage

# Watch specific file
npm test -- AuthContext.test.tsx
```

## Test Organization

```
src/__tests__/
├── contexts/           # Context provider tests
├── components/         # Component tests
├── integration/        # Integration and workflow tests
├── mocks/             # Firebase and storage mocks
└── utils/             # Test helpers
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Reset state before each test
    resetAuthMocks();
  });

  it('should do something specific', async () => {
    // Arrange - Set up test data
    const input = 'test-data';

    // Act - Execute the code
    const result = await doSomething(input);

    // Assert - Verify results
    expect(result).toBe('expected-output');
  });
});
```

### Testing Auth Components

```typescript
import { renderWithAuth } from '../utils/test-utils';
import { createMockUser, setMockAuthState } from '../mocks/firebase';

it('should render when authenticated', async () => {
  // Set up authenticated state
  const mockUser = createMockUser();
  setMockAuthState(mockUser);

  // Render with auth context
  renderWithAuth(<YourComponent />);

  // Verify rendering
  expect(screen.getByText('Welcome')).toBeInTheDocument();
});
```

### Testing Auth Context

```typescript
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

it('should sign in successfully', async () => {
  const { result } = renderHook(() => useAuth(), {
    wrapper: AuthProvider
  });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signInWithGoogle();
  });

  expect(result.current.user).not.toBe(null);
});
```

### Simulating Errors

```typescript
import { createAuthError, mockFirebaseAuth } from '../mocks/firebase';

it('should handle network errors', async () => {
  // Mock error response
  mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(
    createAuthError('auth/network-request-failed', 'Network error')
  );

  // Trigger sign-in
  await expect(signInWithGoogle()).rejects.toThrow();

  // Verify error handling
  expect(errorMessage).toContain('Network error');
});
```

## Common Test Patterns

### 1. Testing Async Operations

```typescript
it('should complete async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### 2. Testing State Changes

```typescript
it('should update state', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await waitFor(() => {
    expect(result.current.user).not.toBe(null);
  });
});
```

### 3. Testing User Interactions

```typescript
it('should handle button click', async () => {
  const user = userEvent.setup();
  renderWithAuth(<SignInButton />);

  await user.click(screen.getByRole('button'));

  expect(mockFirebaseAuth.signInWithPopup).toHaveBeenCalled();
});
```

### 4. Testing Error Recovery

```typescript
it('should retry after error', async () => {
  // First attempt fails
  mockFirebaseAuth.signInWithPopup.mockRejectedValueOnce(new Error('Failed'));

  await expect(signIn()).rejects.toThrow();

  // Second attempt succeeds
  mockFirebaseAuth.signInWithPopup.mockResolvedValueOnce(mockResult);

  await expect(signIn()).resolves.toBeDefined();
});
```

## Test Categories

### Unit Tests
- Individual functions and hooks
- Component rendering
- State management
- Fast execution (< 100ms per test)

### Integration Tests
- Multi-component workflows
- Data flow between layers
- User scenarios
- Moderate execution (< 500ms per test)

### Edge Case Tests
- Boundary conditions
- Error scenarios
- Empty/null states
- Large datasets
- Concurrent operations

## Coverage Requirements

Aim for:
- **90%+ statement coverage**
- **85%+ branch coverage**
- **90%+ function coverage**

Check coverage:
```bash
npm run test:coverage

# Open HTML report
open coverage/index.html
```

## Mocking Guide

### Firebase Auth Mocks

```typescript
import {
  createMockUser,      // Generate mock Firebase user
  setMockAuthState,    // Simulate auth state change
  createAuthError,     // Create Firebase error
  resetAuthMocks       // Clean up between tests
} from '../mocks/firebase';
```

### Storage Mocks

```typescript
import {
  createTestConversation,     // Create test conversation
  addTestConversation,        // Add to mock storage
  resetConversationStorage    // Clean up between tests
} from '../mocks/conversationStorage';
```

## Debugging Tests

### Run Single Test

```bash
# By file name
npm test -- AuthContext.test.tsx

# By test name pattern
npm test -- --grep "sign-in"
```

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### UI Mode (Visual Debugging)

```bash
npm run test:ui
```

Opens browser with:
- Test results visualization
- Coverage view
- File watching
- Re-run on save

### Console Logging in Tests

```typescript
it('should debug', () => {
  console.log('Debug info:', someValue);
  // Tests show console output
});
```

## Common Issues

### "Cannot find module" Error

```bash
# Clear cache and reinstall
rm -rf node_modules .vitest
npm install
```

### Tests Timing Out

```typescript
// Increase timeout for slow tests
it('slow test', async () => {
  // Test code
}, 10000); // 10 seconds
```

### Mock Not Working

1. Import mock before actual module
2. Call `resetAuthMocks()` in `beforeEach()`
3. Verify mock function syntax

### Tests Pass Locally But Fail in CI

1. Check for environment-specific code
2. Ensure deterministic test data (no `Date.now()` without mocking)
3. Verify async operations are properly awaited

## Best Practices

### ✅ DO

- Write tests before implementation (TDD)
- Test one thing per test case
- Use descriptive test names
- Reset mocks between tests
- Test error scenarios
- Use async/await for promises
- Group related tests with `describe()`

### ❌ DON'T

- Share state between tests
- Use real Firebase/IndexedDB
- Skip error case testing
- Write tests that depend on execution order
- Use hardcoded delays (`setTimeout`)
- Test implementation details
- Ignore flaky tests

## TDD Workflow

1. **Write failing test**
   ```typescript
   it('should migrate orphan conversations', async () => {
     // Test that currently fails
   });
   ```

2. **Run test** - Verify it fails
   ```bash
   npm test
   ```

3. **Implement feature** - Make test pass
   ```typescript
   async migrateOrphanConversations(userId: string) {
     // Implementation
   }
   ```

4. **Run test** - Verify it passes
   ```bash
   npm test
   ```

5. **Refactor** - Improve code while tests pass

6. **Repeat** - Next feature

## Pre-Commit Hooks

Tests run automatically on commit:

```bash
# Install hooks
npm run precommit:install

# Manually run checks
npm run precommit:run
```

Hooks will:
- Run all tests
- Check TypeScript compilation
- Lint code
- Prevent commit if tests fail

## CI/CD Integration

Tests run on:
- Every pull request
- Pushes to main branch
- Nightly builds

CI runs:
```bash
npm run test:run --coverage
```

## Resources

- [Full Test Documentation](src/__tests__/README.md)
- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Firebase Testing](https://firebase.google.com/docs/auth/web/start)

## Getting Help

1. Check [Test README](src/__tests__/README.md) for detailed docs
2. Look at existing tests for examples
3. Run `npm run test:ui` for visual debugging
4. Ask the team in #development channel
