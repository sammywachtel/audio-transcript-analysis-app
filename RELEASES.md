# Release Notes

This document tracks all releases of the Audio Transcript Analysis App.

---

## v1.7.0-beta (2026-01-02)

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
- **New Components**
  - `TimestampLink` - Clickable timestamp citation
  - `QuestionSuggestions` - Rotating question prompts
  - `SpeakerContextMenu` - Speaker reassignment menu
  - `useLongPress` hook - Long-press gesture detection

### Changed
- **Transcript Segment Redesign** - Cleaner, more consistent layout
  - Removed left-side per-segment controls
  - Pill-shaped timestamp buttons with proper touch targets
  - Tight vertical spacing (py-1.5) for better density
  - Consistent text alignment across all segments
- **Mobile Responsiveness Improvements**
  - Fixed chat FAB positioning with `calc(4rem + 1rem)`
  - Safe area support for notched devices (`env(safe-area-inset-*)`)
  - Dynamic viewport height (`100dvh`) for mobile browser chrome
  - Fixed header button overflow on Viewer and Library pages

### Technical Details
- `analyticsService.ts` provides event tracking infrastructure
- `timestampLinking.ts` centralizes timestamp interaction logic
- `useLongPress.ts` handles gesture detection with scroll cancellation

---

## v1.6.0-beta (2025-12-31)

### Added
- **Chat History Persistence** - Chat conversations now persist to Firestore
  - Messages survive page reloads and work across devices
  - Pagination with "Load older messages" (10 at a time)
  - 50 message limit per conversation with visual warnings
  - Export chat as JSON with full metadata
  - Clear history with confirmation modal
- **New `useChatHistory` hook** - Real-time Firestore sync for chat state
- **New `ChatHistory` component** - Message display with load-more and controls
- **How-to guide** - `docs/how-to/using-chat.md` for chat feature

### Changed
- **Project restructure** - All source files moved into `src/` directory
  - `components/` → `src/components/`
  - `hooks/` → `src/hooks/`
  - `pages/` → `src/pages/`
  - `services/` → `src/services/`
  - `contexts/` → `src/contexts/`
  - `types.ts`, `constants.ts`, `firebase-config.ts` → `src/config/`
  - `utils.ts` → `src/utils/index.ts`
  - `index.tsx` → `src/main.tsx`
- Updated all import paths to use `@/` alias
- Updated Vite, TypeScript, and Vitest configs for new structure

### Technical Details
- Chat history stored as subcollection: `conversations/{id}/chatHistory/{messageId}`
- `chatHistoryService.ts` provides full CRUD + real-time listeners
- Architecture and data model docs updated to reflect new structure

---

## v1.5.0-beta (2025-12-29)

### Fixed
- **Speaker Label Reversal Bug** - Fixed critical issue where speaker names were reversed in interview-style audio. Pre-analysis was assigning SPEAKER_XX IDs arbitrarily before WhisperX ran, causing mismatches.

### Changed
- Speaker identification now runs AFTER WhisperX transcription completes
- New `identifySpeakersFromContent` function analyzes actual transcript to determine which SPEAKER_XX is which person
- Content-based speaker mapping overrides pre-analysis guesses
- Added `speakerIdentificationSource` logging for debugging

### Technical Details
- Added Step 3.4 to processing pipeline: content-based speaker identification
- Merge function now uses post-WhisperX speaker analysis for name assignment
- +192 lines to `functions/src/transcribe.ts`

---

## v1.4.0-beta (2025-12-28)

### Added
- Dynamic progress status with granular processing steps
- Step metadata support in ProcessingProgress component

---

## v1.3.0-beta (2025-12-24)

### Added
- Admin dashboard for monitoring and observability
- Metrics collection and cost tracking

---

## v1.2.0-beta (2025-12-22)

### Added
- Architecture refactoring (scopes 02-06)
- Improved error handling and retry logic

---

## v1.1.0-beta (2025-12-21)

### Added
- Progressive status updates during processing
- Architecture refactor scope 01

---

## v1.0.0-beta (2025-12-20)

### Initial Beta Release
- Audio upload and transcription via Gemini API
- WhisperX alignment for precise timestamps
- Speaker diarization
- Topic segmentation
- Term extraction with definitions
- Person detection
- Real-time Firestore sync
- Google Auth integration
