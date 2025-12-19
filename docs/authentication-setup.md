# Google Authentication Setup Guide

This guide walks you through setting up Google Authentication for the Audio Transcript Analysis App using Firebase.

## Overview

The app now requires users to sign in with their Google account before accessing conversations. This provides:

- **User isolation**: Each user only sees their own conversations
- **Data security**: Conversations are tied to authenticated user accounts
- **Migration support**: Existing local conversations are automatically claimed on first sign-in
- **Offline-first**: Data remains in IndexedDB with user filtering

## Quick Start

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard (you can disable Google Analytics if you don't need it)

### 2. Enable Google Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Google** provider
3. Toggle "Enable" to ON
4. Set a project support email (your email)
5. Click **Save**

### 3. Register Your Web App

1. Go to **Project Settings** (gear icon in sidebar)
2. Scroll down to "Your apps"
3. Click the **Web** icon (`</>`) to add a web app
4. Enter a nickname (e.g., "Audio Transcript App")
5. **Do NOT** enable Firebase Hosting (we're using Vite)
6. Click **Register app**
7. Copy the `firebaseConfig` object

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in the Firebase configuration from the previous step:
   ```bash
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

3. Keep your existing Gemini API key in `.env`

### 5. Add Authorized Domains

For local development, `localhost` is automatically authorized. For production:

1. Go to **Authentication** > **Settings** > **Authorized domains**
2. Click **Add domain**
3. Enter your production domain (e.g., `your-app.com`)
4. Click **Add**

### 6. Test the Integration

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open `http://localhost:5173` (or your configured port)

3. You should see the sign-in page

4. Click "Sign in with Google"

5. Select your Google account

6. You should be redirected to the app's Library page

## Architecture

### Authentication Flow

```
User → ProtectedRoute → AuthProvider → ConversationProvider → App Content
```

1. **AuthProvider**: Manages Firebase auth state, handles sign-in/out
2. **ProtectedRoute**: Shows sign-in page or app content based on auth state
3. **ConversationProvider**: Filters conversations by authenticated user's ID

### Data Migration

On first sign-in, the app automatically:

1. Checks for conversations without a `userId` (orphan conversations)
2. Associates them with the new user's account
3. Logs migration results to console

This ensures existing local data is preserved when adding authentication.

### User Isolation

Conversations are filtered by `userId` using an IndexedDB index:

- **Save**: Automatically adds current user's ID to conversations
- **Load**: Only loads conversations matching the current user's ID
- **Update**: Maintains userId and adds `updatedAt` timestamp

### Session Management

Firebase SDK handles:
- Token refresh (automatic)
- Cross-tab synchronization (automatic)
- Session persistence (survives browser refresh)
- Secure token storage (IndexedDB)

### Security

- **Client-side**: Firebase Auth SDK with Google OAuth
- **Tokens**: Short-lived (1 hour), auto-refreshed
- **Storage**: IndexedDB with same-origin policy
- **Isolation**: All queries filtered by `userId`

## Component Reference

### New Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `AuthProvider` | Auth state management | `contexts/AuthContext.tsx` |
| `SignInButton` | Google sign-in trigger | `components/auth/SignInButton.tsx` |
| `UserMenu` | User profile dropdown | `components/auth/UserMenu.tsx` |
| `ProtectedRoute` | Auth gate wrapper | `components/auth/ProtectedRoute.tsx` |

### Updated Components

| Component | Changes |
|-----------|---------|
| `App.tsx` | Wrapped with AuthProvider and ProtectedRoute |
| `ConversationContext` | Filters by userId, auto-migration |
| `Library.tsx` | Added UserMenu to header |
| `ViewerHeader.tsx` | Added UserMenu to header |

### Updated Services

| Service | Changes |
|---------|---------|
| `conversationStorage.ts` | Added userId index, user-specific queries, migration methods |

### Updated Types

| Type | Changes |
|------|---------|
| `Conversation` | Added `userId`, `updatedAt`, sync fields |

## Configuration Files

| File | Purpose |
|------|---------|
| `firebase-config.ts` | Firebase initialization |
| `.env.example` | Environment variable template |
| `.env` | Your Firebase config (DO NOT COMMIT) |

## Firebase Console Tasks

### ✅ Required Setup

- [x] Create Firebase project
- [x] Enable Google authentication provider
- [x] Register web app
- [x] Copy config to `.env`
- [x] Add production domain to authorized domains

### 🔮 Future Enhancements

- [ ] Add Firestore for cross-device sync
- [ ] Move Gemini API key to Cloud Functions
- [ ] Add rate limiting per user
- [ ] Implement user preferences in Firestore

## Troubleshooting

### "Missing Firebase environment variables" Warning

**Cause**: `.env` file is missing or Firebase config is incomplete

**Solution**:
1. Copy `.env.example` to `.env`
2. Fill in all `VITE_FIREBASE_*` variables from Firebase Console

### Sign-in Popup Blocked

**Cause**: Browser blocked the OAuth popup window

**Solution**:
1. Allow popups for `localhost` or your domain
2. Or use `signInWithRedirect` instead of `signInWithPopup` (requires code change)

### "This domain is not authorized"

**Cause**: Your domain is not in Firebase authorized domains list

**Solution**:
1. Go to Firebase Console > Authentication > Settings > Authorized domains
2. Add your domain
3. Wait a few minutes for propagation

### Conversations Not Loading After Sign-In

**Cause**: IndexedDB migration may have failed

**Solution**:
1. Open browser DevTools > Console
2. Look for `[Storage]` and `[Auth]` log messages
3. Check if migration completed successfully
4. If needed, manually clear IndexedDB and re-upload conversations

### Cross-Tab Auth Not Syncing

**Cause**: Firebase SDK's cross-tab listener may be blocked

**Solution**:
1. Check browser console for errors
2. Ensure third-party cookies are not blocked
3. Try signing out and back in

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Sign in with your Google account
# Upload audio files and test functionality
```

### Testing Multiple Users

1. Use browser profiles or incognito mode for different users
2. Each user will have isolated conversations
3. Test migration by clearing auth state while keeping IndexedDB data

### Production Deployment

1. Update Firebase authorized domains with production URL
2. Build the app: `npm run build`
3. Deploy `dist/` directory to your hosting provider
4. Test sign-in flow in production

## Security Best Practices

### Do NOT Commit

- ✅ `.env.example` (template with placeholders)
- ❌ `.env` (contains real API keys)
- ❌ Firebase service account keys
- ❌ Any credentials or secrets

### Recommended `.gitignore` Entry

```gitignore
# Environment variables
.env
.env.local
.env.*.local

# Firebase
.firebase/
firebase-debug.log
```

### API Key Security

**Current State**:
- Gemini API key is in client bundle (acceptable for personal use)
- Firebase config is public (this is normal for Firebase web apps)

**Future Production State**:
- Move Gemini API key to Cloud Functions
- Add rate limiting per user
- Implement usage quotas

## Next Steps

Once authentication is working:

1. **Test the migration**: Sign in and verify existing conversations are claimed
2. **Test multi-user**: Sign in with different accounts and verify data isolation
3. **Monitor usage**: Check Firebase Console > Authentication > Users
4. **Plan sync**: Review Firestore architecture doc when ready for cloud sync

## Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Web SDK Reference](https://firebase.google.com/docs/reference/js/auth)
- [Google Sign-In Best Practices](https://developers.google.com/identity/sign-in/web/sign-in)
- [Backend Architecture Doc](./architecture/google-auth-backend-architecture.md)

## Support

If you encounter issues:

1. Check browser console for error messages
2. Review Firebase Console > Authentication > Users
3. Verify `.env` configuration matches Firebase Console
4. Check authorized domains in Firebase settings
5. Review migration logs in browser console

---

**Last Updated**: 2024-12-18
**Firebase SDK Version**: 10.14.0
**Implementation Status**: ✅ Complete
