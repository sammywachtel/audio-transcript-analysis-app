import React, { useEffect, useRef, useCallback } from 'react';
import { Speaker } from '@/config/types';
import { cn } from '@/utils';
import { SPEAKER_DOT_COLORS } from '@/config/constants';
import { Edit2 } from 'lucide-react';

interface SpeakerContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  currentSpeaker: Speaker;
  allSpeakers: Speaker[];
  onReassign: (speakerId: string) => void;
  onRename: () => void;
  onClose: () => void;
}

/**
 * Context menu for speaker reassignment, triggered by long-press or right-click.
 * Intelligently positions itself to avoid viewport overflow.
 * Handles keyboard navigation and accessibility.
 */
export const SpeakerContextMenu: React.FC<SpeakerContextMenuProps> = ({
  isOpen,
  position,
  currentSpeaker,
  allSpeakers,
  onReassign,
  onRename,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [finalPosition, setFinalPosition] = React.useState(position);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Calculate intelligent positioning to avoid viewport overflow
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = position.x;
    let finalY = position.y;

    // Check right edge overflow
    if (position.x + menuRect.width > viewportWidth - 20) {
      finalX = Math.max(20, viewportWidth - menuRect.width - 20);
    }

    // Check bottom edge overflow
    if (position.y + menuRect.height > viewportHeight - 20) {
      finalY = Math.max(20, position.y - menuRect.height);
    }

    // Check left edge
    finalX = Math.max(20, finalX);

    // Check top edge
    finalY = Math.max(20, finalY);

    setFinalPosition({ x: finalX, y: finalY });
  }, [isOpen, position]);

  // Handle outside clicks
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, allSpeakers.length)); // +1 for rename option
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex < allSpeakers.length) {
            handleSpeakerSelect(allSpeakers[selectedIndex].speakerId);
          } else {
            handleRename();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, allSpeakers, onClose]);

  // Focus menu when opened
  useEffect(() => {
    if (isOpen && menuRef.current) {
      menuRef.current.focus();
    }
  }, [isOpen]);

  const handleSpeakerSelect = useCallback((speakerId: string) => {
    if (speakerId !== currentSpeaker.speakerId) {
      onReassign(speakerId);
    }
    onClose();
  }, [currentSpeaker.speakerId, onReassign, onClose]);

  const handleRename = useCallback(() => {
    onRename();
    onClose();
  }, [onRename, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for mobile (prevents accidental taps) */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
        onClick={onClose}
      />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className="fixed bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[200px] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          left: `${finalPosition.x}px`,
          top: `${finalPosition.y}px`
        }}
        role="menu"
        aria-label="Speaker reassignment menu"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-100 bg-slate-50">
          Reassign Segment
        </div>

        {/* Speaker List */}
        <div className="py-1">
          {allSpeakers.map((speaker, index) => {
            const isCurrent = speaker.speakerId === currentSpeaker.speakerId;
            const isSelected = index === selectedIndex;
            const dotColor = SPEAKER_DOT_COLORS[speaker.colorIndex % SPEAKER_DOT_COLORS.length];

            return (
              <button
                key={speaker.speakerId}
                onClick={() => handleSpeakerSelect(speaker.speakerId)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2.5 transition-colors",
                  isCurrent && "bg-slate-100 font-medium",
                  isSelected && "bg-blue-50"
                )}
                role="menuitem"
                aria-current={isCurrent ? 'true' : undefined}
              >
                {/* Speaker color dot */}
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />

                {/* Speaker name */}
                <span className="flex-1 truncate">{speaker.displayName}</span>

                {/* Current indicator */}
                {isCurrent && (
                  <span className="text-blue-500 text-base shrink-0">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Rename Option */}
        <button
          onClick={handleRename}
          className={cn(
            "w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2.5 transition-colors",
            selectedIndex === allSpeakers.length && "bg-blue-50"
          )}
          role="menuitem"
        >
          <Edit2 size={14} className="text-slate-600 shrink-0" />
          <span className="flex-1 text-slate-700">Rename Speaker</span>
        </button>
      </div>
    </>
  );
};
