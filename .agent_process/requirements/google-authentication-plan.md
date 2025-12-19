# Google Authentication Implementation Plan

## Overview
This document outlines the plan to add Google Account authentication to the Audio Transcript Analysis App.

## Current State
- **No Authentication**: App runs entirely client-side with no user accounts
- **Local Storage**: Conversations stored in browser IndexedDB
- **API Keys**: Gemini API key stored in environment variables (client-side)
- **No Backend**: All processing happens in the browser

## Goals
1. Enable users to sign in with their Google Account
2. Persist user identity across devices
3. Prepare for backend integration (conversation sync, cloud storage)
4. Secure API key management (move from client to server)

## Architecture Options

### Option 1: Firebase Authentication (Recommended)
**Pros:**
- Quick setup with Google provider
- Built-in session management
- Seamless integration with Firestore for future data persistence
- Free tier sufficient for prototype
- SDKs handle token refresh automatically
- Works well with React

**Cons:**
- Vendor lock-in to Firebase/Google Cloud
- Adds external dependency

**Implementation:**
```typescript
// Install dependencies
npm install firebase

// Initialize Firebase (firebase-config.ts)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth Context (contexts/AuthContext.tsx)
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

export const AuthProvider: React.FC<{ children }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Option 2: Google OAuth 2.0 + Custom Backend
**Pros:**
- Full control over auth flow
- No vendor lock-in
- Can use any backend (Node.js, Python, etc.)
- More flexible for custom requirements

**Cons:**
- More complex setup (OAuth flow, token validation, session management)
- Need to build backend infrastructure
- Handle token refresh manually
- More security considerations (CSRF, XSS protection)

**Implementation:**
```typescript
// Would require:
// 1. Google Cloud Console project setup
// 2. OAuth 2.0 credentials
// 3. Backend server for token exchange
// 4. Session management (JWT or sessions)
// 5. PKCE flow for security
```

### Option 3: Auth0 / Clerk
**Pros:**
- Managed auth service with Google provider
- Beautiful pre-built UI components
- Support for multiple auth methods
- Good developer experience

**Cons:**
- Additional cost after free tier
- External dependency
- More overhead for simple use case

## Recommended Approach: Firebase Authentication

**Rationale:**
- Fastest path to working authentication
- Aligns with future Firestore backend integration
- Google-native solution for Google Sign-In
- Free tier covers prototype needs

## Implementation Phases

### Phase 1: Add Firebase Authentication
**Tasks:**
1. Create Firebase project in console
2. Enable Google Authentication provider
3. Install Firebase SDK
4. Create `AuthContext` with sign-in/sign-out
5. Add sign-in screen/modal
6. Wrap app with `AuthProvider`
7. Add user profile display in header

**Files to Create:**
- `src/firebase-config.ts` - Firebase initialization
- `src/contexts/AuthContext.tsx` - Auth state management
- `src/components/auth/SignInModal.tsx` - Sign-in UI
- `src/components/auth/UserMenu.tsx` - User profile dropdown

**Files to Modify:**
- `App.tsx` - Wrap with AuthProvider, show SignInModal if not authenticated
- `.env.example` - Add Firebase config variables

### Phase 2: Protect Routes
**Tasks:**
1. Require authentication to access Viewer and Library
2. Show landing page or sign-in modal for unauthenticated users
3. Persist auth state across page reloads

### Phase 3: User-Scoped Data (Future)
**Tasks:**
1. Associate conversations with user IDs
2. Migrate IndexedDB schema to include userId
3. Filter conversations by current user
4. Add logout flow (clear local data or keep?)

## Security Considerations

1. **API Key Protection:**
   - Current: Gemini API key exposed in client-side code
   - Future: Move API calls to backend, use server-side API key
   - Intermediate: Use Firebase Functions to proxy Gemini API calls

2. **Auth Token Storage:**
   - Firebase handles token storage securely in localStorage/cookies
   - Use `onAuthStateChanged` to react to auth state

3. **Data Privacy:**
   - Ensure users can only access their own conversations
   - Implement proper Firestore security rules when adding backend

## Environment Variables

New variables needed in `.env`:
```bash
# Firebase Configuration
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
```

## Testing Strategy

1. **Manual Testing:**
   - Test sign-in flow with Google account
   - Test sign-out flow
   - Test auth state persistence (refresh page)
   - Test with multiple users

2. **Edge Cases:**
   - Network offline during sign-in
   - Sign-in popup blocked
   - Token expiration/refresh
   - Multiple tabs with different users

## Migration Strategy

**Existing Users (IndexedDB data):**
- On first sign-in, associate existing conversations with the new user
- Add "userId" field to existing conversations
- Graceful migration without data loss

**Future Backend Sync:**
- Keep IndexedDB as local cache
- Sync to Firestore on sign-in
- Offline-first architecture with sync on reconnect

## User Experience Flow

```
┌─────────────────┐
│  App Loads      │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Auth     │
    │ Loading? │
    └────┬─────┘
         │
    ┌────▼────────┐
    │ Logged In?  │
    └─────┬───────┘
          │
    ┌─────▼──────┬─────────────┐
    │ Yes        │ No          │
    │            │             │
┌───▼────┐  ┌───▼─────────┐   │
│Library │  │Sign-In Modal│   │
│/Viewer │  │             │   │
└────────┘  └─────────────┘   │
```

## Timeline Estimate
- **Phase 1** (Auth Setup): 1-2 days
- **Phase 2** (Route Protection): 0.5 day
- **Phase 3** (User-Scoped Data): 1 day

**Total: 2.5-3.5 days** for basic Google authentication

## Dependencies

```json
{
  "dependencies": {
    "firebase": "^10.x.x"
  }
}
```

## Next Steps
1. Review and approve this plan
2. Create Firebase project
3. Implement Phase 1 (Auth setup)
4. Test with real Google accounts
5. Proceed to backend integration plan

## Related Documents
- `backend-integration-plan.md` - How auth enables backend features
- `speaker-naming-requirements.md` - Speaker detection (independent of auth)

## Status
- **Current**: Implementation in progress (December 18, 2024)
- **Next**: Phase 1 implementation - Core Auth setup
- **Architecture**: Backend architecture completed (see `/docs/architecture/google-auth-backend-architecture.md`)

## Implementation Updates

### Architecture Decisions (Finalized)
1. **Firebase Authentication** - Confirmed for fastest implementation
2. **IndexedDB remains primary storage** - Maintains offline-first architecture
3. **Defer Cloud Functions** - Client-side Gemini API acceptable for prototype
4. **Add userId to Conversation type** - Prepare for future sync

### Implementation Files Created
- `docs/architecture/google-auth-backend-architecture.md` - Complete backend architecture design

### Next Implementation Steps
1. Create Firebase project in console
2. Implement core auth files (firebase-config.ts, AuthContext.tsx)
3. Create sign-in UI components
4. Update App.tsx with auth provider
5. Test auth flow end-to-end
