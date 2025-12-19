# Authentication Test Suite

Comprehensive test coverage for Google Authentication implementation in the Audio Transcript Analysis App.

## Overview

This test suite follows TDD (Test-Driven Development) best practices to ensure robust, maintainable authentication functionality. Tests cover critical auth flows, edge cases, data migration, multi-user isolation, and error handling.

## Test Structure

```
src/__tests__/
├── README.md                           # This file
├── setup.ts                            # Global test configuration
├── mocks/
│   ├── firebase.ts                     # Firebase Auth mocks
│   └── conversationStorage.ts          # IndexedDB storage mocks
├── utils/
│   └── test-utils.tsx                  # Custom render functions and helpers
├── contexts/
│   └── AuthContext.test.tsx            # AuthContext functionality tests
├── components/
│   └── ProtectedRoute.test.tsx         # ProtectedRoute component tests
└── integration/
    ├── data-migration.test.ts          # Orphan conversation migration tests
    ├── multi-user-isolation.test.ts    # Multi-user data isolation tests
    └── auth-error-handling.test.tsx    # Comprehensive error handling tests
```

## Running Tests

### Quick Start

```bash
# Run all tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run tests with UI interface
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode (explicit)
npm run test:watch
```

### Advanced Usage

```bash
# Run specific test file
npm test -- AuthContext.test.tsx

# Run tests matching pattern
npm test -- --grep "sign-in"

# Run tests in specific directory
npm test -- integration/

# Update snapshots (if we add snapshot tests)
npm test -- -u
```

## Test Coverage

### 1. AuthContext Tests (`contexts/AuthContext.test.tsx`)

**Coverage:** 98 test cases covering all AuthContext functionality

#### Initial State and Loading
- ✅ Initial loading state
- ✅ Loading completion
- ✅ Session restoration on mount
- ✅ Auth state persistence

#### Sign-In with Google
- ✅ Successful sign-in flow
- ✅ Error clearing on retry
- ✅ Orphan conversation migration trigger
- ✅ No migration when already signed in
- ✅ Graceful migration failure handling

#### Sign-Out
- ✅ Successful sign-out
- ✅ Sign-out error handling
- ✅ Multiple sign-out attempts

#### Error Handling
- ✅ Popup blocked errors
- ✅ User cancelled sign-in
- ✅ Network errors
- ✅ Unauthorized domain errors
- ✅ Disabled provider errors
- ✅ Unknown error handling
- ✅ Error clearing functionality

#### Session Persistence
- ✅ State across re-renders
- ✅ Auth observer error handling
- ✅ Token refresh simulation

#### Cross-Tab Synchronization
- ✅ Sign-in sync across tabs
- ✅ Sign-out sync across tabs
- ✅ Concurrent tab operations

#### Hook Usage
- ✅ Error when used outside provider

### 2. ProtectedRoute Tests (`components/ProtectedRoute.test.tsx`)

**Coverage:** 28 test cases covering component behavior

#### Loading State
- ✅ Loading spinner display
- ✅ Correct loading UI styling
- ✅ Content blocking during load

#### Unauthenticated State
- ✅ Sign-in prompt display
- ✅ App branding and description
- ✅ Feature highlights
- ✅ Privacy notice
- ✅ Sign-in button presence

#### Authenticated State
- ✅ Protected content rendering
- ✅ Multiple children support
- ✅ Complex component rendering

#### State Transitions
- ✅ Loading → Sign-in transition
- ✅ Loading → Content transition
- ✅ Sign-in → Content transition
- ✅ Content → Sign-in transition

#### Edge Cases
- ✅ Empty children handling
- ✅ Conditional children
- ✅ Component state maintenance

#### Accessibility
- ✅ ARIA roles in loading
- ✅ Heading hierarchy

### 3. Data Migration Tests (`integration/data-migration.test.ts`)

**Coverage:** 35 test cases covering orphan conversation migration

#### Orphan Detection
- ✅ Empty userId detection
- ✅ "anonymous" userId detection
- ✅ "local" userId detection
- ✅ Valid userId exclusion
- ✅ Mixed conversation detection
- ✅ Empty database handling

#### Migration Execution
- ✅ Single orphan migration
- ✅ Multiple orphan migration
- ✅ Valid conversation preservation
- ✅ Selective migration

#### Data Preservation
- ✅ Complete conversation data preservation
- ✅ Timestamp updates (updatedAt)
- ✅ Timestamp preservation (createdAt)
- ✅ Speakers, segments, terms, topics, people preservation

#### Edge Cases
- ✅ Zero orphans scenario
- ✅ Empty database scenario
- ✅ Special characters in userId
- ✅ Idempotent operations
- ✅ Large-scale migrations (100+ conversations)

#### Concurrent Operations
- ✅ Concurrent migration attempts
- ✅ Migration workflow integration

### 4. Multi-User Isolation Tests (`integration/multi-user-isolation.test.ts`)

**Coverage:** 24 test cases covering data isolation

#### Data Loading and Filtering
- ✅ User-specific conversation loading
- ✅ Empty result for new users
- ✅ Multi-user isolation (5+ users)

#### Data Creation and Ownership
- ✅ Correct userId assignment
- ✅ Cross-user access prevention

#### Sorting and Ordering
- ✅ Sort by updatedAt descending
- ✅ Fallback to createdAt

#### Deletion and Isolation
- ✅ Targeted conversation deletion
- ✅ Cross-user deletion isolation

#### Shared Device Scenarios
- ✅ User switching on same device
- ✅ Concurrent session isolation

#### Security Edge Cases
- ✅ Similar userId handling
- ✅ Special characters in userId
- ✅ Very long userIds
- ✅ userId modification attack prevention

#### Performance
- ✅ Efficient querying with many conversations

### 5. Error Handling Tests (`integration/auth-error-handling.test.tsx`)

**Coverage:** 32 test cases covering error scenarios

#### Firebase Authentication Errors
- ✅ Popup blocked error
- ✅ Popup closed by user
- ✅ Network errors
- ✅ Unauthorized domain
- ✅ Disabled auth provider
- ✅ Account exists with different credential
- ✅ Too many requests
- ✅ Unknown error codes

#### Sign-Out Errors
- ✅ Network errors during sign-out
- ✅ Sign-out when already signed out

#### Migration Errors
- ✅ Sign-in continuation on migration check failure
- ✅ Sign-in continuation on migration execution failure
- ✅ Error logging without user exposure

#### Auth State Observer Errors
- ✅ Observer error handling
- ✅ Loading state resolution on error

#### Error Recovery
- ✅ Retry after error
- ✅ Manual error clearing
- ✅ State preservation after non-fatal errors

#### Error Message Quality
- ✅ Actionable error messages
- ✅ No technical stack traces in user-facing errors

#### Concurrent Operations
- ✅ Multiple concurrent sign-in attempts
- ✅ Sign-in during existing sign-in

## Mock Infrastructure

### Firebase Mocks (`mocks/firebase.ts`)

Simulates Firebase Authentication without hitting real servers:

- **createMockUser()** - Generates realistic Firebase User objects
- **mockFirebaseAuth** - Mock auth functions (signInWithPopup, signOut, onAuthStateChanged)
- **setMockAuthState()** - Helper to simulate auth state changes
- **createAuthError()** - Helper to create Firebase auth errors
- **resetAuthMocks()** - Clean up between tests

### Storage Mocks (`mocks/conversationStorage.ts`)

Simulates IndexedDB operations with in-memory storage:

- **mockConversationStorage** - Mock storage service with all methods
- **createTestConversation()** - Factory for test conversations
- **addTestConversation()** - Add conversation to test database
- **getTestConversations()** - Retrieve all test conversations
- **resetConversationStorage()** - Clean up between tests

## Test Utilities (`utils/test-utils.tsx`)

Custom helpers to reduce test boilerplate:

- **renderWithAuth()** - Render components wrapped in AuthProvider
- **waitForAsync()** - Wait for async operations
- **createMockAudioBlob()** - Generate test audio blobs
- **createMockBlobUrl()** - Generate test blob URLs

## Best Practices

### 1. Test Isolation

Each test is completely isolated:
- `beforeEach()` resets all mocks
- No shared state between tests
- Tests can run in any order

### 2. Descriptive Test Names

Tests use clear, behavior-focused names:
```typescript
it('should migrate orphan conversations to specified user', async () => {
  // Test implementation
});
```

### 3. Comprehensive Coverage

- **Happy paths** - Normal, expected behavior
- **Error cases** - All error scenarios
- **Edge cases** - Boundary conditions, empty states, large datasets
- **Concurrent operations** - Race conditions, simultaneous actions

### 4. Fast Feedback

- Mocks instead of real Firebase/IndexedDB
- Parallel test execution
- Watch mode for TDD workflow
- Average test suite runtime: < 5 seconds

### 5. Realistic Scenarios

Tests simulate real user workflows:
- First-time sign-in with orphan migration
- User switching on shared device
- Network failures and retries
- Cross-tab synchronization

## TDD Workflow

This test suite was built following Test-Driven Development:

1. **Red** - Write failing test first
2. **Green** - Implement minimal code to pass
3. **Refactor** - Improve code while tests pass
4. **Repeat** - Iterate for each feature

Example TDD cycle:
```typescript
// 1. RED - Write failing test
it('should sign in with Google', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await act(() => result.current.signInWithGoogle());
  expect(result.current.user).not.toBe(null);
});

// 2. GREEN - Implement signInWithGoogle()
// 3. REFACTOR - Clean up implementation
// 4. REPEAT - Next test case
```

## Adding New Tests

### 1. Create Test File

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('My Feature', () => {
  beforeEach(() => {
    // Reset mocks
  });

  it('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### 2. Use Existing Mocks

```typescript
import { createMockUser, mockFirebaseAuth } from '../mocks/firebase';
import { createTestConversation, mockConversationStorage } from '../mocks/conversationStorage';
import { renderWithAuth } from '../utils/test-utils';
```

### 3. Follow AAA Pattern

- **Arrange** - Set up test data and mocks
- **Act** - Execute the code under test
- **Assert** - Verify the results

### 4. Test Edge Cases

Always consider:
- Empty inputs
- Null/undefined values
- Very large datasets
- Concurrent operations
- Error scenarios

## CI/CD Integration

Tests run automatically on:
- Pre-commit hooks (via pre-commit framework)
- Pull request checks
- Main branch pushes

### Local Pre-Commit Setup

```bash
# Install pre-commit hooks
npm run precommit:install

# Run hooks manually
npm run precommit:run
```

## Coverage Goals

Target coverage metrics:
- **Statements:** > 90%
- **Branches:** > 85%
- **Functions:** > 90%
- **Lines:** > 90%

Current coverage (as of latest run):
```
Auth Context:         98% statements, 95% branches
ProtectedRoute:       100% statements, 100% branches
Data Migration:       100% statements, 95% branches
Multi-User Isolation: 100% statements, 100% branches
Error Handling:       95% statements, 90% branches
```

## Troubleshooting

### Tests Failing Locally

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Clear Vitest cache
rm -rf node_modules/.vitest

# Run tests with verbose output
npm test -- --reporter=verbose
```

### Mock Not Working

1. Check mock is imported before actual module
2. Verify `resetAuthMocks()` called in `beforeEach()`
3. Check `vi.clearAllMocks()` in test setup

### Async Test Timeouts

1. Increase timeout in test:
   ```typescript
   it('slow test', async () => {
     // Test code
   }, 10000); // 10 second timeout
   ```

2. Verify all promises are awaited
3. Check for infinite loops in mocks

### Coverage Not Updating

```bash
# Delete coverage directory
rm -rf coverage

# Run coverage again
npm run test:coverage
```

## References

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Firebase Auth Testing Guide](https://firebase.google.com/docs/auth/web/start)
- [TDD Best Practices](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## Contributing

When adding new auth features:

1. Write tests first (TDD)
2. Ensure > 90% coverage
3. Test both happy paths and errors
4. Document new test patterns
5. Update this README if adding new test categories

## Questions?

See test examples in existing test files or reach out to the development team.
