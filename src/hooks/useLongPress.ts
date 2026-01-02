import React, { useRef, useCallback, useState } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface UseLongPressOptions {
  onLongPress: (position: Position) => void;
  delay?: number; // Default: 500ms
  threshold?: number; // Movement threshold in pixels to cancel (default: 10)
  shouldPreventDefault?: boolean;
}

export interface UseLongPressReturn {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isLongPressing: boolean;
}

/**
 * Hook for detecting long-press gestures on touch and desktop.
 * Handles both touch (500ms press) and right-click (immediate) contexts.
 *
 * Cancels on drag/scroll to prevent accidental activation.
 * Provides visual feedback state during press.
 */
export function useLongPress({
  onLongPress,
  delay = 500,
  threshold = 10,
  shouldPreventDefault = true
}: UseLongPressOptions): UseLongPressReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<Position | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsLongPressing(false);
  }, []);

  const handleStart = useCallback((position: Position) => {
    startPosRef.current = position;
    setIsLongPressing(true);

    timerRef.current = setTimeout(() => {
      onLongPress(position);
      // Haptic feedback if supported (mobile)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsLongPressing(false);
    }, delay);
  }, [onLongPress, delay]);

  const handleMove = useCallback((currentPos: Position) => {
    if (!startPosRef.current) return;

    // Calculate distance from start position
    const distance = Math.hypot(
      currentPos.x - startPosRef.current.x,
      currentPos.y - startPosRef.current.y
    );

    // Cancel if moved beyond threshold (user is dragging/scrolling)
    if (distance > threshold) {
      clearTimer();
    }
  }, [threshold, clearTimer]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    if (shouldPreventDefault) {
      e.preventDefault();
    }

    handleStart({ x: e.clientX, y: e.clientY });
  }, [handleStart, shouldPreventDefault]);

  const onMouseUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onMouseLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      clearTimer();
      return;
    }

    if (shouldPreventDefault) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    handleStart({ x: touch.clientX, y: touch.clientY });
  }, [handleStart, shouldPreventDefault, clearTimer]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      clearTimer();
      return;
    }

    const touch = e.touches[0];
    handleMove({ x: touch.clientX, y: touch.clientY });
  }, [handleMove, clearTimer]);

  const onTouchEnd = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Handle right-click (desktop context menu)
    e.preventDefault();
    clearTimer();
    onLongPress({ x: e.clientX, y: e.clientY });
  }, [onLongPress, clearTimer]);

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onContextMenu,
    isLongPressing
  };
}
