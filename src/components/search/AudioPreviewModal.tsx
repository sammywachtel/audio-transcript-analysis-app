import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, Pause, Loader2 } from 'lucide-react';
import { formatTime } from '@/utils';
import { Button } from '../Button';

interface AudioPreviewModalProps {
  audioUrl: string;
  clipStartMs: number;
  clipEndMs: number;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

/**
 * AudioPreviewModal - Plays a 15-second audio clip from search results
 *
 * Features:
 * - Auto-plays on mount (with fallback for blocked autoplay)
 * - Scrub slider limited to clip window
 * - Play/pause control
 * - Loading/buffering state
 * - Escape key + backdrop click to close
 * - Returns focus to trigger button on close
 */
export const AudioPreviewModal: React.FC<AudioPreviewModalProps> = ({
  audioUrl,
  clipStartMs,
  clipEndMs,
  onClose,
  triggerRef
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasInitializedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(clipStartMs);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const clipDurationMs = clipEndMs - clipStartMs;

  // Initialize audio element and attempt autoplay
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    hasInitializedRef.current = false;

    // Step 1: When metadata loads, seek to clip start
    const handleLoadedMetadata = () => {
      audio.currentTime = clipStartMs / 1000;
    };

    // Step 2: After seek completes, clear loading and attempt play
    const handleSeeked = () => {
      // Only run initialization once
      if (hasInitializedRef.current) return;
      hasInitializedRef.current = true;

      setIsLoading(false);

      // Try to autoplay (may be blocked by browser)
      audio.play().catch((err) => {
        console.warn('[AudioPreviewModal] Autoplay blocked:', err);
        setAutoplayBlocked(true);
      });
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const handleTimeUpdate = () => {
      const currentMs = audio.currentTime * 1000;
      setCurrentTimeMs(currentMs);

      // Stop playback when we reach clip end
      if (currentMs >= clipEndMs) {
        audio.pause();
        audio.currentTime = clipEndMs / 1000;
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    // Cleanup on unmount
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl, clipStartMs, clipEndMs]);

  // Handle play/pause toggle
  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      setAutoplayBlocked(false); // Clear blocked state on manual play
      audioRef.current.play().catch((err) => {
        console.error('[AudioPreviewModal] Play failed:', err);
      });
    }
  }, [isPlaying]);

  // Handle scrubbing within clip window
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;

    const relativeMs = parseFloat(e.target.value);
    const absoluteMs = clipStartMs + relativeMs;
    audioRef.current.currentTime = absoluteMs / 1000;
    setCurrentTimeMs(absoluteMs);
  }, [clipStartMs]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Return focus to trigger button on close
  const handleClose = useCallback(() => {
    if (triggerRef?.current) {
      triggerRef.current.focus();
    }
    onClose();
  }, [onClose, triggerRef]);

  // Calculate relative time within clip
  const relativeTimeMs = Math.max(0, Math.min(currentTimeMs - clipStartMs, clipDurationMs));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click when clicking modal
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Audio Preview</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={32} className="text-blue-500 animate-spin" />
            <span className="ml-3 text-slate-600">Loading audio...</span>
          </div>
        )}

        {/* Autoplay blocked message */}
        {autoplayBlocked && !isPlaying && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Autoplay was blocked. Click play to start.
          </div>
        )}

        {/* Controls (shown when not loading) */}
        {!isLoading && (
          <div className="space-y-4">
            {/* Time display */}
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>{formatTime(relativeTimeMs)}</span>
              <span>{formatTime(clipDurationMs)}</span>
            </div>

            {/* Scrub slider */}
            <input
              type="range"
              min={0}
              max={clipDurationMs}
              value={relativeTimeMs}
              onChange={handleScrub}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(relativeTimeMs / clipDurationMs) * 100}%, #e2e8f0 ${(relativeTimeMs / clipDurationMs) * 100}%, #e2e8f0 100%)`
              }}
            />

            {/* Play/Pause button */}
            <div className="flex justify-center">
              <Button
                variant="primary"
                onClick={handlePlayPause}
                className="gap-2 w-32"
              >
                {isPlaying ? (
                  <>
                    <Pause size={16} />
                    Pause
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Play
                  </>
                )}
              </Button>
            </div>

            {/* Clip info */}
            <div className="text-xs text-center text-slate-500">
              Playing 15-second clip: {formatTime(clipStartMs)} - {formatTime(clipEndMs)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
