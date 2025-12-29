# Release Notes

This document tracks all releases of the Audio Transcript Analysis App.

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
