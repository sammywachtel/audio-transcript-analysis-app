# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Large File Upload Timeouts** - Audio files now process more reliably
  - Node.js undici `headersTimeout` extended to 25 minutes (fixes root cause of `HeadersTimeoutError`)
  - Gemini API calls configured with 20-minute SDK-level timeout as additional safeguard
  - Replicate API calls configured with 3-minute timeout via custom fetch wrapper
  - Gateway errors (502/503/504) now trigger automatic retries in WhisperX transcription
  - Note: Storage-triggered functions limited to 9 minutes by GCP; very large files may still timeout

## [1.8.0-beta] - 2026-01-05

### Added
- **Admin Cost Visibility Dashboard** - Comprehensive cost transparency tools for finance and operations
  - Job Detail view at `/admin/jobs/:metricId` with timing breakdowns, token usage, pricing snapshots, and Replicate prediction links
  - Chat metrics tab aggregating conversational queries by conversation with token usage and response time analytics
  - Cost Reconciliation report at `/admin/reports/cost-reconciliation` with weekly/monthly summaries, variance detection (>5% highlighted), and CSV export
  - Cost verification badges showing estimated vs. current pricing with ✓/⚠️/❌ status indicators
- **User Cost Visibility** - Pricing accuracy indicator on My Stats page
  - Shows whether stored costs match current configured rates (✓ match / ⚠️ minor / ❌ significant variance)
  - Displays timestamp when rates were captured
  - Includes disclaimer about configured vs actual billing rates
  - Admin users see "View cost breakdown" link to admin dashboard

### Changed
- **Vertex AI SDK Migration** - Replaced `@google/generative-ai` with `@google-cloud/vertexai` for billing label support
  - All 6 Gemini API calls now include billing labels (`conversation_id`, `user_id`, `call_type`, `environment`)
  - Enables cost tracking and reconciliation via GCP billing reports
  - Updated `transcribeWithWhisperX()` to return `predictionId` for all successful transcriptions
  - Authentication changed from API key to service account credentials
- **Cost Display Centralization** - Removed inline cost estimates from modals
  - Delete and abort confirmation modals no longer show dollar amounts
  - Users directed to My Stats page for accurate cost information
  - Prevents displaying ad-hoc cost guesses during active processing

### Fixed
- Admin dashboard URL routing now properly handles `/admin`, `/admin/jobs/:id`, and `/admin/reports/cost-reconciliation` paths
- Job detail views now correctly load metric data using Firestore document IDs
- Cost Reconciliation report period dates now use local timezone instead of UTC to prevent off-by-one date errors
- Pricing accuracy indicator now correctly shows "No pricing configured" when `_pricing` collection is empty (previously showed false "match" status)

---

## [1.7.0-beta] - 2026-01-02

### Added
- **Timestamp Citations** - Clickable `[MM:SS]` links in AI chat responses
  - Auto-play audio at timestamp
  - Scroll transcript and highlight segment
  - Error recovery UI for missing segments
- **Question Suggestions** - Rotating prompts in chat interface
  - 44px touch targets with haptic feedback on mobile
  - Suggestions refresh after each query
- **Analytics Service** - Track chat interactions and costs
  - Message sent/received events
  - Timestamp click tracking
  - Cost warning events at $0.50 and $1.25 thresholds
- **Long-press Speaker Reassignment** - Touch-friendly gesture for mobile
  - 500ms long-press or right-click shows context menu
  - Keyboard navigation (Arrow keys, Enter, Escape)
  - Haptic feedback on mobile devices
- New components: `TimestampLink`, `QuestionSuggestions`, `SpeakerContextMenu`, `useLongPress` hook

### Changed
- **Transcript Segment Redesign** - Cleaner, more consistent layout
  - Removed left-side per-segment controls
  - Pill-shaped timestamp buttons with proper touch targets
  - Tight vertical spacing (py-1.5) for better density
- **Mobile Responsiveness Improvements**
  - Fixed chat FAB positioning with `calc(4rem + 1rem)`
  - Safe area support for notched devices (`env(safe-area-inset-*)`)
  - Dynamic viewport height (`100dvh`) for mobile browser chrome
  - Fixed header button overflow on Viewer and Library pages

---

## [1.6.0-beta] - 2025-12-31

### Added
- **Chat History Persistence** - Chat conversations now persist to Firestore
  - Messages survive page reloads and work across devices
  - Pagination with "Load older messages" (10 at a time)
  - 50 message limit per conversation with visual warnings
  - Export chat as JSON with full metadata
  - Clear history with confirmation modal
- New `useChatHistory` hook for real-time Firestore sync
- New `ChatHistory` component for message display
- How-to guide: `docs/how-to/using-chat.md`

### Changed
- **Project restructure** - All source files moved into `src/` directory
  - `components/`, `hooks/`, `pages/`, `services/`, `contexts/` → `src/`
  - `types.ts`, `constants.ts`, `firebase-config.ts` → `src/config/`
  - `utils.ts` → `src/utils/index.ts`
  - `index.tsx` → `src/main.tsx`
- Updated all import paths to use `@/` alias
- Updated Vite, TypeScript, and Vitest configs for new structure

---

## [1.5.0-beta] - 2025-12-29

### Fixed
- **Speaker Label Reversal Bug** - Fixed critical issue where speaker names were reversed in interview-style audio. Pre-analysis was assigning SPEAKER_XX IDs arbitrarily before WhisperX ran.

### Changed
- Speaker identification now runs AFTER WhisperX transcription completes
- New `identifySpeakersFromContent` function analyzes actual transcript
- Content-based speaker mapping overrides pre-analysis guesses
- Added `speakerIdentificationSource` logging for debugging

---

## [1.4.0-beta] - 2025-12-28

### Added
- **Gemini-first Pipeline** - Improved diarization by running Gemini analysis first
- **Abort and Retry** - Processing jobs can now be aborted and retried
- **Comprehensive Observability** - Admin dashboard with user stats
- Switched to `thomasmol/whisper-diarization` model for better accuracy

### Fixed
- Deduplicated repeated words from WhisperX output
- Handled broken WhisperX diarization with sentence-based grouping
- Cloud Scheduler IAM role for scheduled functions

---

## [1.3.0-beta] - 2025-12-25

### Added
- **Admin Dashboard** - Observability metrics and monitoring
- Metrics collection wired to Firestore `_metrics` collection
- Timing metrics for Gemini processing

### Fixed
- Admin dashboard timestamp display and added user ID column
- Removed obsolete Timestamp Fallback stat card
- Excluded test files from functions build

---

## [1.2.0-beta] - 2025-12-23

### Added
- **Gemini Speaker Reassignment** - AI-powered speaker correction without timestamp manipulation

---

## [1.1.0-beta] - 2025-12-23

### Added
- **Single-project Architecture** - Self-healing CI/CD pipeline
- Multi-method Firebase Storage bucket creation
- Custom domain mappings support for Cloud Run
- Improved whisper diarization with new model and boundary fixes

### Fixed
- Firebase Storage rules path and `.firebaserc` setup
- Service agent IAM bindings were being skipped
- Removed hardcoded storage bucket from firebase.json

---

## [1.0.0-beta] - 2025-12-23

**Detailed changelog tracking begins with this version.**

For historical context, see the summary below and the [full git history](https://github.com/sammywachtel/audio-transcript-analysis-app/commits/main).

### Added
- Audio upload and transcription via Gemini API
- WhisperX alignment for precise timestamps
- Speaker diarization
- Topic segmentation
- Term extraction with definitions
- Person detection
- Real-time Firestore sync
- Google Auth integration
- Cloud Run deployment infrastructure

---

## Historical Summary

### Initial Development (2025-12-16 to 2025-12-23)

The foundational development phase, from initial commit to first beta release.

**Highlights:**
- Built React + TypeScript frontend with real-time Firestore integration
- Implemented Gemini API integration for transcription and analysis
- Added WhisperX timestamp alignment service for precise audio sync
- Created Cloud Run deployment infrastructure with CI/CD
- Established Firebase Auth with Google sign-in

**Key commits:**
- `3e9f664` Initial commit: Audio Transcript Analysis App (2025-12-16)
- `848f8bc` Add Cloud Run deployment infrastructure and refactor architecture (2025-12-17)
- `ec8d1f9` Add WhisperX timestamp alignment service (Phase 2) (2025-12-18)
- `c75abd2` Implement HARDY alignment algorithm for robust timestamp matching (2025-12-18)

---

*For complete historical details, see the [commit history](https://github.com/sammywachtel/audio-transcript-analysis-app/commits/main).*
