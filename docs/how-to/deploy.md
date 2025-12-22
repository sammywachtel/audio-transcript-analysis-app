# Deployment Guide

Deploy the Audio Transcript Analysis App to production.

## Architecture Overview

| Component | Platform | Trigger |
|-----------|----------|---------|
| Frontend | Cloud Run | Push to `main` (parallel) |
| Cloud Functions | Firebase | Push to `main` (parallel) |
| Security Rules | Firebase | Manual deployment |

**Note:** Frontend and Firebase Functions deploy in parallel on merge to main (~3-4 min total).

## Prerequisites

- Firebase project set up ([Firebase Setup Guide](firebase-setup.md))
- GitHub repository with Actions enabled
- Required secrets configured

## Automatic Deployment (CI/CD)

Deployments happen automatically when you push to `main`:

### Frontend (Cloud Run)

Triggered when any frontend files change:
- React components, pages, hooks
- TypeScript/CSS files
- Package.json, Dockerfile

### Firebase (Functions + Rules)

Triggered when Firebase files change:
- `functions/**`
- `firestore.rules`, `storage.rules`
- `firestore.indexes.json`
- `firebase.json`

## GitHub Secrets Required

Configure in **Settings → Secrets and variables → Actions**:

### For Cloud Run Deployment

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity provider |
| `GCP_SERVICE_ACCOUNT` | Service account email |
| `VITE_FIREBASE_API_KEY` | Firebase API key (from `firebase apps:sdkconfig`) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (e.g., `project-id.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket (e.g., `project-id.firebasestorage.app`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID (project number) |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

> **Note**: The `VITE_` prefix is required - Vite only exposes environment variables with this prefix to client-side code.

### Firebase Secrets (One-Time Setup)

These secrets are stored in Firebase Secret Manager, not GitHub:

| Secret | Description | Setup Command |
|--------|-------------|---------------|
| `GEMINI_API_KEY` | Google AI Studio API key | `npx firebase functions:secrets:set GEMINI_API_KEY` |
| `REPLICATE_API_TOKEN` | Replicate API token for WhisperX | `npx firebase functions:secrets:set REPLICATE_API_TOKEN` |

**Important:** Set these secrets before the first deployment:
```bash
npx firebase functions:secrets:set GEMINI_API_KEY
npx firebase functions:secrets:set REPLICATE_API_TOKEN
```

To get Firebase config values:
```bash
firebase apps:sdkconfig WEB --project=your-project-id
```

### For Firebase Deployment

| Secret | Description |
|--------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON |

## Manual Deployment

### Deploy Everything

```bash
# Deploy Firebase (rules + functions)
npx firebase deploy

# Deploy frontend to Cloud Run
./deploy.sh
```

### Deploy Specific Components

```bash
# Security rules only
npx firebase deploy --only firestore:rules,storage:rules

# Cloud Functions only
npx firebase deploy --only functions

# Frontend only
gcloud run deploy audio-transcript-app \
  --source . \
  --region us-west1 \
  --allow-unauthenticated
```

## Deployment Scripts

### Firebase Deployment Script

```bash
./scripts/deploy-firebase.sh

# Options:
./scripts/deploy-firebase.sh --rules-only    # Deploy rules only
./scripts/deploy-firebase.sh --functions     # Deploy functions only
./scripts/deploy-firebase.sh --dry-run       # Preview changes
```

### First-Time Setup Script

```bash
./scripts/setup-firebase.sh
```

## Verifying Deployment

### Check Cloud Run

```bash
# List services
gcloud run services list

# Get service URL
gcloud run services describe audio-transcript-app \
  --region us-west1 \
  --format="value(status.url)"
```

### Check Firebase Functions

```bash
# List deployed functions
npx firebase functions:list

# View function logs
npx firebase functions:log
```

### Health Checks

```bash
# Frontend
curl https://your-app-url.run.app/health

# Functions (check logs after upload)
npx firebase functions:log --only transcribeAudio
```

## Rollback

### Cloud Run

```bash
# List revisions
gcloud run revisions list --service audio-transcript-app

# Rollback to previous revision
gcloud run services update-traffic audio-transcript-app \
  --to-revisions=REVISION_NAME=100
```

### Firebase Functions

Firebase keeps previous versions. Redeploy from a previous commit:

```bash
git checkout <previous-commit>
npx firebase deploy --only functions
```

## Cost Optimization

### Cloud Run

- **Min instances**: 0 (scales to zero when idle)
- **Max instances**: 10 (adjust based on traffic)
- **CPU**: 1 (sufficient for SPA serving)
- **Memory**: 256Mi

### Firebase

- **Firestore**: Pay per read/write (optimize queries)
- **Storage**: Pay per GB stored + bandwidth
- **Functions**: Pay per invocation + compute time

### Tips

1. Use Firebase caching headers for static assets
2. Minimize Firestore reads with real-time listeners (not polling)
3. Compress audio before upload (client-side)
4. Monitor usage in Firebase Console

## Monitoring

### Firebase Console

- **Functions**: Invocations, errors, latency
- **Firestore**: Read/write counts, storage
- **Storage**: Bandwidth, storage size

### Cloud Run Console

- **Requests**: Count, latency, error rate
- **Instances**: Active, memory usage
- **Logs**: Request and application logs

### Alerts

Set up alerts in Google Cloud Console:
- Function error rate > 5%
- Storage > 80% of quota
- Unusual traffic spikes

## Debug Logging

Cloud Functions include comprehensive debug logging for troubleshooting transcription and alignment.

### Cloud Functions (Firebase)

Debug logs are always written. To view them:

1. Go to **Cloud Console** → **Logging** → **Logs Explorer**
2. Filter by resource: `Cloud Function` → `transcribeAudio`
3. Set severity to include **Debug**

**Log prefixes to look for:**
- `[Transcribe]` - File processing, timing, status updates
- `[Gemini]` - API calls, response parsing
- `[Transform]` - Data model transformation
- `[Alignment]` - Alignment request preparation, timing
- `[WhisperX]` - Replicate API calls, word timestamps
- `[HARDY]` - Alignment algorithm, anchor detection, region alignment
- `[Anchors]` - Anchor point matching, skip statistics

### Frontend (Browser Console)

The `useAudioPlayer` hook logs drift correction details to the browser console:
- `[Drift Analysis]` - Audio vs transcript duration comparison
- `[Auto-Sync]` - Timestamp scaling when drift correction is applied

Open browser DevTools (F12) → Console to view these logs.

## Troubleshooting

### Deployment fails with permission error

Check IAM roles for service account. See [Firebase Setup](firebase-setup.md#cicd-setup).

### Functions not updating

1. Check function logs: `npx firebase functions:log`
2. Verify build succeeded: `cd functions && npm run build`
3. Force redeploy: `npx firebase deploy --only functions --force`

### Cloud Run returns 503

1. Check container logs in Cloud Console
2. Verify health check endpoint works locally
3. Check memory limits aren't exceeded

### Domain not authorized for sign-in

Firebase Auth only allows sign-in from pre-approved domains. After deploying to Cloud Run, add the new domain:

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project
2. **Authentication** → **Settings** → **Authorized domains**
3. Click **Add domain**
4. Add your Cloud Run domain (e.g., `audio-transcript-app-xxxxx-uw.a.run.app`)

> **Tip**: Get your Cloud Run URL with:
> ```bash
> gcloud run services describe audio-transcript-app --region=us-west1 --format="value(status.url)"
> ```
