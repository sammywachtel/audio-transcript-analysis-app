# Google Authentication Backend Architecture

## Executive Summary

This document defines the backend architecture for implementing Google Authentication in the Audio Transcript Analysis App. The design prioritizes:

1. **Minimal disruption** to the existing client-side architecture
2. **Offline-first operation** with IndexedDB as primary storage
3. **Future-ready** for Firestore sync without over-engineering today
4. **Security improvement** by moving Gemini API key server-side

---

## 1. Service Architecture

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React + Vite)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │ AuthContext  │   │ Conversation │   │ IndexedDB    │   │ UI          │ │
│  │              │   │ Context      │   │ (Local-First)│   │ Components  │ │
│  │ - user       │──▶│ - loadAll()  │──▶│              │   │             │ │
│  │ - signIn()   │   │ - save()     │   │ conversations│   │             │ │
│  │ - signOut()  │   │ - sync()     │   │ + userId     │   │             │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘   └─────────────┘ │
│         │                  │                                               │
│         │ Firebase Auth    │ Future: Firestore Sync                       │
└─────────┼──────────────────┼───────────────────────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FIREBASE SERVICES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │ Firebase Auth    │    │ Cloud Functions  │    │ Firestore (Future)   │  │
│  │                  │    │ (Optional)       │    │                      │  │
│  │ Google Provider  │    │ - geminiProxy()  │    │ /users/{uid}         │  │
│  │ Session Mgmt     │    │ - validateToken()│    │ /conversations/{id}  │  │
│  │ Token Refresh    │    │                  │    │                      │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────────┘  │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ Gemini API       │
                          │ (Server-side key)│
                          └──────────────────┘
```

### 1.2 Service Boundaries

| Service | Responsibility | Location |
|---------|---------------|----------|
| **Auth Service** | User identity, sign-in/out, token management | Firebase Auth (client SDK) |
| **Storage Service** | Local conversation persistence | IndexedDB (client) |
| **Sync Service** | Future: Cross-device data sync | Firestore (planned) |
| **Transcription Proxy** | Secure Gemini API calls | Cloud Functions (optional) |

### 1.3 Key Architecture Decisions

**Decision 1: Firebase Auth over Custom OAuth**
- Rationale: 80% faster implementation, automatic token refresh, built-in security
- Trade-off: Vendor lock-in to Google Cloud ecosystem
- Mitigation: Auth is a thin layer; could swap later if needed

**Decision 2: Keep IndexedDB as Primary Storage**
- Rationale: Maintains offline-first architecture, instant load times
- Trade-off: More complex sync logic later
- Mitigation: Add `userId` field now; sync layer is additive

**Decision 3: Defer Cloud Functions**
- Rationale: Client-side Gemini API works for prototype; premature optimization otherwise
- Trade-off: API key remains in client bundle (acceptable for personal use)
- Mitigation: Document the Cloud Functions path; implement when needed

---

## 2. Data Models

### 2.1 User Profile (Firebase Auth Provided)

Firebase Auth provides the user object automatically. We don't need a separate user collection initially.

```typescript
// firebase-auth.d.ts (from Firebase SDK)
interface User {
  uid: string;              // Unique user identifier
  email: string | null;     // User's email
  displayName: string | null;
  photoURL: string | null;  // Google profile picture
  emailVerified: boolean;
  metadata: {
    creationTime: string;
    lastSignInTime: string;
  };
}
```

### 2.2 Extended User Profile (Future Firestore)

Only create this when we need user-specific settings beyond auth:

```typescript
// /users/{uid} - Firestore document (FUTURE)
interface UserProfile {
  uid: string;              // Primary key, matches Firebase Auth UID
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;

  // User preferences
  preferences: {
    theme: 'light' | 'dark' | 'system';
    defaultPlaybackRate: number;
    autoSaveInterval: number; // ms
  };

  // Usage tracking (for quotas, if needed)
  usage: {
    conversationCount: number;
    totalAudioMinutes: number;
    lastTranscriptionAt: Timestamp | null;
  };
}
```

### 2.3 Updated Conversation Model

Add `userId` to the existing Conversation type for user-scoping:

```typescript
// types.ts - Updated
export interface Conversation {
  conversationId: string;
  userId: string;           // NEW: Owner's Firebase UID
  title: string;
  createdAt: string;
  updatedAt: string;        // NEW: For sync conflict resolution
  durationMs: number;
  audioUrl?: string;
  status: 'processing' | 'needs_review' | 'complete' | 'failed';

  // Sync metadata (FUTURE)
  syncStatus?: 'local_only' | 'synced' | 'pending_upload' | 'conflict';
  lastSyncedAt?: string;

  // Existing fields unchanged
  speakers: Record<string, Speaker>;
  segments: Segment[];
  terms: Record<string, Term>;
  termOccurrences: TermOccurrence[];
  topics: Topic[];
  people: Person[];
  alignmentStatus?: 'none' | 'aligned' | 'drift_corrected';
}
```

### 2.4 IndexedDB Schema Update

```typescript
// services/conversationStorage.ts - Updated schema
interface ContextualAppDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation & { audioBlob?: Blob };
    indexes: {
      'by-user': string;      // NEW: Index for filtering by userId
      'by-sync-status': string; // FUTURE: For sync queue
    };
  };

  // FUTURE: Sync queue for offline changes
  syncQueue: {
    key: string;
    value: {
      id: string;
      operation: 'create' | 'update' | 'delete';
      conversationId: string;
      timestamp: string;
      payload?: Partial<Conversation>;
    };
  };
}
```

### 2.5 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA MODEL RELATIONSHIPS                      │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐       1:N        ┌──────────────────────┐
│    User      │─────────────────▶│    Conversation      │
│  (Firebase)  │                  │    (IndexedDB +      │
│              │                  │     Future Firestore)│
│  uid (PK)    │                  │                      │
│  email       │                  │  conversationId (PK) │
│  displayName │                  │  userId (FK)         │
│  photoURL    │                  │  title               │
└──────────────┘                  │  segments[]          │
                                  │  speakers{}          │
                                  │  terms{}             │
                                  │  topics[]            │
                                  │  people[]            │
                                  └──────────────────────┘
                                           │
                                           │ Contains
                                           ▼
                          ┌────────────────────────────────┐
                          │  Embedded Documents            │
                          │  (No separate collections)     │
                          │                                │
                          │  - Segment[] (denormalized)    │
                          │  - Speaker{} (keyed by ID)     │
                          │  - Term{} (keyed by ID)        │
                          │  - TermOccurrence[]            │
                          │  - Topic[]                     │
                          │  - Person[]                    │
                          └────────────────────────────────┘
```

---

## 3. Authentication Flow

### 3.1 Sign-In Sequence

```
┌────────┐     ┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│  User  │     │  React App  │     │ Firebase Auth │     │ Google OAuth │
└───┬────┘     └──────┬──────┘     └───────┬───────┘     └──────┬───────┘
    │                 │                    │                    │
    │ Click "Sign In" │                    │                    │
    │────────────────▶│                    │                    │
    │                 │                    │                    │
    │                 │ signInWithPopup()  │                    │
    │                 │───────────────────▶│                    │
    │                 │                    │                    │
    │                 │                    │ OAuth 2.0 Redirect │
    │◀────────────────┼────────────────────┼───────────────────▶│
    │                 │                    │                    │
    │ Select Account  │                    │                    │
    │────────────────▶│                    │                    │
    │                 │                    │                    │
    │                 │                    │   ID Token + Refresh
    │                 │                    │◀───────────────────│
    │                 │                    │                    │
    │                 │  User Credential   │                    │
    │                 │◀───────────────────│                    │
    │                 │                    │                    │
    │                 │ Store in AuthContext                    │
    │                 │─────────────┐      │                    │
    │                 │             │      │                    │
    │                 │◀────────────┘      │                    │
    │                 │                    │                    │
    │                 │ Migrate local data │                    │
    │                 │ (add userId)       │                    │
    │                 │─────────────┐      │                    │
    │                 │             │      │                    │
    │                 │◀────────────┘      │                    │
    │                 │                    │                    │
    │  Show Library   │                    │                    │
    │◀────────────────│                    │                    │
    │                 │                    │                    │
```

### 3.2 Session Management

```typescript
// contexts/AuthContext.tsx
interface AuthState {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

interface AuthContextValue extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>; // For API calls
}
```

**Token Lifecycle:**

| Event | Action | SDK Method |
|-------|--------|------------|
| App Load | Check existing session | `onAuthStateChanged()` |
| Token Expiry | Auto-refresh (SDK handles) | Automatic |
| Sign Out | Clear session, optionally clear local data | `signOut()` |
| Tab Focus | Verify session still valid | `onAuthStateChanged()` |

### 3.3 Protected Routes Pattern

```typescript
// components/auth/ProtectedRoute.tsx
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <SignInPrompt />;
  }

  return <>{children}</>;
};

// App.tsx usage
function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <ProtectedRoute>
          <AppContent />
        </ProtectedRoute>
      </ConversationProvider>
    </AuthProvider>
  );
}
```

---

## 4. Technology Stack

### 4.1 Recommended Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Auth Provider** | Firebase Auth | Native Google integration, auto token refresh, free tier sufficient |
| **Client SDK** | `firebase` npm package | Official SDK, tree-shakeable, well-documented |
| **Local Storage** | IndexedDB via `idb` | Already in use, supports offline-first |
| **State Management** | React Context | Already established pattern in codebase |
| **Future Sync** | Firestore | Seamless Firebase integration, real-time sync |
| **API Proxy (Optional)** | Cloud Functions | Secure API keys, usage tracking |

### 4.2 Dependencies to Add

```json
{
  "dependencies": {
    "firebase": "^10.14.0"
  }
}
```

**Bundle Impact:**
- Firebase Auth only: ~35KB gzipped
- With Firestore (future): +45KB gzipped
- Tree-shaking keeps unused modules out

### 4.3 Environment Variables

```bash
# .env.local (Vite format)
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Keep existing (move to Cloud Function later)
VITE_GEMINI_API_KEY=your-gemini-key
```

---

## 5. Security Considerations

### 5.1 Authentication Security

| Concern | Mitigation |
|---------|------------|
| **Token Storage** | Firebase SDK stores in IndexedDB with encryption |
| **XSS Attacks** | Tokens not accessible via JavaScript (SDK handles) |
| **CSRF** | OAuth state parameter validated by SDK |
| **Session Hijacking** | HTTPS only, secure cookie flags |
| **Token Expiry** | 1-hour ID tokens, auto-refresh handled by SDK |

### 5.2 Data Security

| Concern | Mitigation |
|---------|------------|
| **User Data Isolation** | All queries filter by `userId` |
| **Local Storage Access** | IndexedDB same-origin policy |
| **Audio Data** | Stored as Blobs in IndexedDB (not accessible cross-origin) |
| **Cross-Tab Auth** | `onAuthStateChanged` syncs state across tabs |

### 5.3 API Key Security (Current vs Future)

**Current State (Acceptable for Prototype):**
- Gemini API key in client bundle via `VITE_GEMINI_API_KEY`
- Risk: Key extraction from bundle
- Mitigation: API key quotas, usage monitoring in Google Cloud

**Future State (Production):**
```typescript
// Cloud Function: functions/src/geminiProxy.ts
import * as functions from 'firebase-functions';
import { GoogleGenAI } from '@google/genai';

export const transcribeAudio = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  // Rate limiting per user
  await checkRateLimit(context.auth.uid);

  // Server-side API key (never exposed to client)
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Process transcription...
  return result;
});
```

### 5.4 Firestore Security Rules (Future)

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Conversations belong to their creator
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 6. Integration Points

### 6.1 Files to Create

| File | Purpose |
|------|---------|
| `src/firebase-config.ts` | Firebase initialization |
| `src/contexts/AuthContext.tsx` | Auth state management |
| `src/components/auth/SignInButton.tsx` | Sign-in UI component |
| `src/components/auth/UserMenu.tsx` | Profile dropdown |
| `src/hooks/useAuth.ts` | Auth convenience hook |

### 6.2 Files to Modify

| File | Changes |
|------|---------|
| `App.tsx` | Wrap with `AuthProvider`, add auth gate |
| `contexts/ConversationContext.tsx` | Filter by userId, add migration logic |
| `services/conversationStorage.ts` | Add userId index, migration helpers |
| `types.ts` | Add `userId` to Conversation |
| `.env.example` | Add Firebase config template |
| `vite.config.ts` | Ensure `VITE_` env vars are loaded |

### 6.3 Integration Sequence

```
Phase 1: Core Auth (2-3 days)
├── Create Firebase project
├── Enable Google Auth provider
├── Create firebase-config.ts
├── Create AuthContext
├── Create SignInButton + UserMenu
├── Wrap App with AuthProvider
└── Test sign-in/out flow

Phase 2: Data Migration (1 day)
├── Add userId to types.ts
├── Update IndexedDB schema with index
├── Create migration helper for existing data
├── Update ConversationContext to filter by user
└── Test multi-user scenarios

Phase 3: Polish (0.5 days)
├── Handle edge cases (popup blocked, network error)
├── Add loading states
├── Create error boundaries for auth failures
└── Update documentation

FUTURE: Cloud Functions (when needed)
├── Create functions/src/geminiProxy.ts
├── Deploy Cloud Function
├── Update utils.ts to call function
└── Remove client-side API key
```

### 6.4 API Contract Examples

**Sign In Flow:**
```typescript
// Usage in component
const { signInWithGoogle, loading, error } = useAuth();

const handleSignIn = async () => {
  try {
    await signInWithGoogle();
    // Success - AuthContext updates automatically
  } catch (e) {
    // Handle popup blocked, network error, etc.
  }
};
```

**Protected Data Access:**
```typescript
// ConversationContext updated to filter by user
const { conversations, addConversation } = useConversations();

// addConversation automatically associates with current user
await addConversation(newConversation); // userId injected

// loadAll automatically filters by current user
const myConversations = await conversationStorage.loadAllForUser(user.uid);
```

---

## 7. Scaling Considerations

### 7.1 Current Limitations (Acceptable for Prototype)

| Limitation | Impact | When to Address |
|------------|--------|-----------------|
| Client-side Gemini API | Key exposed in bundle | Production release |
| No cross-device sync | Data is device-local | Multi-device users |
| No usage quotas | Unbounded API costs | Shared deployment |
| Single region storage | Latency for global users | International users |

### 7.2 Scaling Path

```
Current State:
  Client ─────────────▶ Gemini API (direct)
  Client ─────────────▶ Firebase Auth
  Client ─────────────▶ IndexedDB (local)

Growth Phase (10-100 users):
  Client ─────────────▶ Firebase Auth
  Client ─────────────▶ Cloud Functions ──▶ Gemini API
  Client ─────────────▶ IndexedDB + Firestore Sync

Scale Phase (100+ users):
  Client ─────────────▶ Firebase Auth
  Client ─────────────▶ Cloud Functions (with rate limiting)
  Client ─────────────▶ Firestore (with caching)
  Cloud Storage for audio files (instead of Firestore blobs)
```

### 7.3 Cost Projections

| Firebase Service | Free Tier | Notes |
|-----------------|-----------|-------|
| Authentication | 50K MAU | More than enough for prototype |
| Firestore Reads | 50K/day | ~1,600 conversation loads |
| Firestore Writes | 20K/day | ~600 conversation saves |
| Cloud Functions | 2M invocations/month | Ample for transcription |
| Cloud Storage | 5GB | For audio files (future) |

---

## 8. Appendix

### 8.1 Firebase Project Setup Checklist

```markdown
[ ] Create Firebase project at console.firebase.google.com
[ ] Enable Google Sign-In provider (Authentication > Sign-in method)
[ ] Add localhost to authorized domains
[ ] Add production domain to authorized domains
[ ] Copy config to .env.local
[ ] Enable Firestore in test mode (for future)
[ ] Set up billing alerts
```

### 8.2 Sample Firebase Config

```typescript
// src/firebase-config.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Request additional OAuth scopes if needed
googleProvider.addScope('profile');
googleProvider.addScope('email');
```

### 8.3 Sample AuthContext Implementation

```typescript
// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase-config';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Sign in failed'));
      throw e;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Sign out failed'));
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### 8.4 Migration Helper

```typescript
// services/conversationStorage.ts - Addition

/**
 * Migrate existing conversations to include userId
 * Called once after first sign-in to claim orphan conversations
 */
async migrateOrphanConversations(userId: string): Promise<number> {
  const db = await this.getDB();
  const tx = db.transaction('conversations', 'readwrite');
  const store = tx.objectStore('conversations');

  let migratedCount = 0;
  let cursor = await store.openCursor();

  while (cursor) {
    const conversation = cursor.value;

    // If no userId, assign to current user
    if (!conversation.userId) {
      await cursor.update({
        ...conversation,
        userId,
        updatedAt: new Date().toISOString()
      });
      migratedCount++;
    }

    cursor = await cursor.continue();
  }

  await tx.done;
  return migratedCount;
}
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-18 | Claude | Initial architecture design |
