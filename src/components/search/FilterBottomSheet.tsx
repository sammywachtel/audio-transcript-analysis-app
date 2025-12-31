import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SearchFilters } from '../../hooks/useSearchFilters';
import { SpeakerOption, TopicOption } from '../../hooks/useSearch';
import { DateRangeFilter } from './DateRangeFilter';
import { SpeakerFilter } from './SpeakerFilter';
import { TopicFilter } from './TopicFilter';
import { Button } from '../Button';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  activeFilterCount: number;
  speakerOptions: SpeakerOption[];
  topicOptions: TopicOption[];
  onDateRangeChange: (range: SearchFilters['dateRange']) => void;
  onCustomDateChange: (start: Date | undefined, end: Date | undefined) => void;
  onToggleSpeaker: (speakerId: string) => void;
  onToggleTopic: (topicId: string) => void;
  onClearAll: () => void;
}

/**
 * FilterBottomSheet - Mobile bottom sheet for filters
 *
 * Features:
 * - Slides up from bottom with backdrop
 * - Drag-to-dismiss gesture (swipe down >80px to close)
 * - Same filter content as sidebar
 * - Apply and Clear buttons at bottom
 */
export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({
  isOpen,
  onClose,
  filters,
  activeFilterCount,
  speakerOptions,
  topicOptions,
  onDateRangeChange,
  onCustomDateChange,
  onToggleSpeaker,
  onToggleTopic,
  onClearAll
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState({
    isDragging: false,
    startY: 0,
    currentY: 0
  });

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Drag gesture handlers for dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragState({
      isDragging: true,
      startY: e.touches[0].clientY,
      currentY: 0
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.isDragging) return;

    const deltaY = e.touches[0].clientY - dragState.startY;

    // Only allow downward drag (positive deltaY)
    if (deltaY > 0) {
      setDragState(prev => ({
        ...prev,
        currentY: deltaY
      }));
    }
  };

  const handleTouchEnd = () => {
    if (!dragState.isDragging) return;

    const DISMISS_THRESHOLD = 80; // pixels

    if (dragState.currentY > DISMISS_THRESHOLD) {
      // Close the sheet if drag exceeded threshold
      onClose();
    }

    // Reset drag state (sheet will animate back if not closing)
    setDragState({
      isDragging: false,
      startY: 0,
      currentY: 0
    });
  };

  // Calculate transform for drag visual feedback
  const getDragTransform = () => {
    if (dragState.isDragging && dragState.currentY > 0) {
      return `translateY(${dragState.currentY}px)`;
    }
    return 'translateY(0)';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[85vh] flex flex-col md:hidden"
        style={{
          transform: getDragTransform(),
          transition: dragState.isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-12 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 text-sm text-blue-600">({activeFilterCount})</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Date Range */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Date Range</h3>
            <DateRangeFilter
              dateRange={filters.dateRange}
              customStart={filters.customStart}
              customEnd={filters.customEnd}
              onDateRangeChange={onDateRangeChange}
              onCustomDateChange={onCustomDateChange}
            />
          </div>

          {/* Speakers */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              Speakers
              {filters.speakers.length > 0 && (
                <span className="ml-1.5 text-xs text-blue-600 font-semibold">
                  ({filters.speakers.length})
                </span>
              )}
            </h3>
            <div className="max-h-48 overflow-y-auto">
              <SpeakerFilter
                selectedSpeakers={filters.speakers}
                speakerOptions={speakerOptions}
                onToggleSpeaker={onToggleSpeaker}
              />
            </div>
          </div>

          {/* Topics */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              Topics
              {filters.topics.length > 0 && (
                <span className="ml-1.5 text-xs text-blue-600 font-semibold">
                  ({filters.topics.length})
                </span>
              )}
            </h3>
            <div className="max-h-64 overflow-y-auto">
              <TopicFilter
                selectedTopics={filters.topics}
                topicOptions={topicOptions}
                onToggleTopic={onToggleTopic}
              />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                onClearAll();
                onClose();
              }}
              className="flex-1"
            >
              Clear All
            </Button>
          )}
          <Button
            onClick={onClose}
            className="flex-1"
          >
            Apply
          </Button>
        </div>
      </div>
    </>
  );
};
