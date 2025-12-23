# Getting Started

Complete tutorial for setting up the Audio Transcript Analysis App from scratch.

## What You'll Build

By the end of this tutorial, you'll have:
- A running local development environment
- Firebase backend configured (auth, database, storage, functions)
- The ability to upload audio and get AI-powered transcripts

## Prerequisites

- **Node.js 18+**: [Download](https://nodejs.org/)
- **Git**: [Download](https://git-scm.com/)
- **Google Account**: For Firebase and Google Sign-In

## Step 1: Clone the Repository

```bash
git clone https://github.com/sammywachtel/audio-transcript-analysis-app.git
cd audio-transcript-analysis-app
```

## Step 2: Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install Cloud Functions dependencies
cd functions && npm install && cd ..
```

## Step 3: Set Up Firebase

**Option A: Automated Setup (Recommended)**

Use the setup script to configure everything in one command:

```bash
# Find your billing account ID
gcloud billing accounts list

# Run setup (optionally include GitHub repo for CI/CD)
./scripts/gcp-setup.sh <project-id> <billing-account-id> [github-org/repo]

# Example:
./scripts/gcp-setup.sh my-app-12345 01A2B3-C4D5E6-F7G8H9 myorg/my-repo
```

**Option B: Manual Setup**

Follow the complete [Firebase Setup Guide](../how-to/firebase-setup.md) to:

1. Create a Firebase project
2. Enable required Google Cloud APIs
3. Enable Google Authentication
4. Set up Firestore and Storage
5. Register your web app
6. Configure environment variables

**After setup (both options):**

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Firebase config
# (Get values from Firebase Console → Project Settings → Your apps)
# IMPORTANT: Set GCP_PROJECT_ID to the same value as VITE_FIREBASE_PROJECT_ID
```

## Step 4: Configure Gemini API

If you ran the automated setup script (`gcp-setup.sh`) with "y" when prompted, the Gemini API key was created automatically. Otherwise, create one in your GCP project:

```bash
PROJECT_ID="your-project-id"

# Create API key restricted to Gemini
gcloud services api-keys create \
  --project=$PROJECT_ID \
  --display-name="gemini-api-key" \
  --api-target=service=generativelanguage.googleapis.com

# Store in Firebase secrets
npx firebase login
npx firebase use $PROJECT_ID
npx firebase functions:secrets:set GEMINI_API_KEY
```

Or via Console: [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → **Create Credentials** → **API key**

## Step 5: Deploy Firebase Backend

```bash
# Deploy security rules
npx firebase deploy --only firestore:rules,storage:rules

# Deploy Cloud Functions
npx firebase deploy --only functions
```

## Step 6: Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Step 7: Test the App

1. Click **Sign in with Google**
2. Authorize the app
3. Click **Upload Audio**
4. Select an audio file (MP3, M4A, WAV)
5. Wait for processing (handled by Cloud Functions)
6. View your interactive transcript!

## What's Happening Under the Hood

```
1. User uploads audio file
   ↓
2. Frontend uploads to Firebase Storage
   ↓
3. Cloud Function triggers (onObjectFinalized)
   ↓
4. Function calls Gemini API with audio
   ↓
5. Gemini returns: speakers, transcript, terms, topics, people
   ↓
6. Function writes results to Firestore
   ↓
7. Frontend receives real-time update
   ↓
8. User sees interactive transcript
```

## Next Steps

- **[Local Development](../how-to/local-development.md)** - Development workflow tips
- **[Testing](../how-to/testing.md)** - Run and write tests
- **[Architecture](../reference/architecture.md)** - Understand the system design
- **[Deployment](../how-to/deploy.md)** - Deploy to production

## Troubleshooting

### Sign-in popup blocked

Allow popups for `localhost` in your browser settings.

### "Missing or insufficient permissions"

Deploy security rules:
```bash
npx firebase deploy --only firestore:rules,storage:rules
```

### Functions not triggering

1. Check Cloud Functions are deployed: `npx firebase functions:list`
2. Verify Gemini API secret is set: `npx firebase functions:secrets:access GEMINI_API_KEY`
3. Check function logs: `npx firebase functions:log`

### Need more help?

Check the [Firebase Setup Guide](../how-to/firebase-setup.md) for detailed troubleshooting.
