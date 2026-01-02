/**
 * Timestamp Linking Utilities
 *
 * Centralized logic for timestamp citation interactions:
 * - Scroll to segment
 * - Seek audio
 * - Trigger playback
 * - Highlight segment with 2s pulse
 * - Handle missing segment/audio gracefully
 */

/**
 * Result of timestamp linking operation
 */
export interface TimestampLinkResult {
  success: boolean;
  segmentFound: boolean;
  audioAvailable: boolean;
  message?: string;
}

/**
 * Options for timestamp linking
 */
export interface TimestampLinkOptions {
  /** Segment ID to navigate to */
  segmentId: string;
  /** Timestamp in milliseconds */
  startMs: number;
  /** Callback to seek audio */
  onSeek?: (timeMs: number) => void;
  /** Callback to trigger playback */
  onPlay?: () => void;
  /** Callback to set highlighted segment */
  onHighlight?: (segmentId: string | null) => void;
  /** Whether to auto-play after seeking */
  autoPlay?: boolean;
}

/**
 * Handle timestamp link click
 *
 * Performs all timestamp interaction logic:
 * 1. Scroll to segment in transcript
 * 2. Seek audio to timestamp
 * 3. Optionally trigger playback
 * 4. Highlight segment for 2 seconds
 * 5. Return status for error handling
 */
export function handleTimestampLink(options: TimestampLinkOptions): TimestampLinkResult {
  const {
    segmentId,
    startMs,
    onSeek,
    onPlay,
    onHighlight,
    autoPlay = false
  } = options;

  // Check if segment exists in DOM
  const segmentElement = document.getElementById(`segment-${segmentId}`);
  const segmentFound = segmentElement !== null;

  // Scroll to segment if found
  if (segmentElement) {
    segmentElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    // Highlight segment for 2 seconds
    if (onHighlight) {
      onHighlight(segmentId);
      setTimeout(() => {
        onHighlight(null);
      }, 2000);
    }
  }

  // Seek audio if callback provided
  const audioAvailable = onSeek !== undefined;
  if (onSeek) {
    onSeek(startMs);
  }

  // Auto-play if requested and callback provided
  if (autoPlay && onPlay && audioAvailable) {
    // Small delay to ensure seek completes
    setTimeout(() => {
      onPlay?.();
    }, 100);
  }

  // Determine success and message
  let success = true;
  let message: string | undefined;

  if (!segmentFound && !audioAvailable) {
    success = false;
    message = 'Segment and audio not available';
  } else if (!segmentFound) {
    success = false;
    message = 'Segment not found in transcript';
  } else if (!audioAvailable) {
    success = false;
    message = 'Audio not loaded yet';
  }

  return {
    success,
    segmentFound,
    audioAvailable,
    message
  };
}

/**
 * Format timestamp for display
 * Exported from @/utils but duplicated here for convenience
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
