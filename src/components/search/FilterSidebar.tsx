import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { SearchFilters } from '../../hooks/useSearchFilters';
import { SpeakerOption, TopicOption } from '../../hooks/useSearch';
import { DateRangeFilter } from './DateRangeFilter';
import { SpeakerFilter } from './SpeakerFilter';
import { TopicFilter } from './TopicFilter';
import { Button } from '../Button';

interface FilterSidebarProps {
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
 * FilterSidebar - Desktop filter sidebar with collapsible sections
 *
 * 300px width sidebar with:
 * - Clear all button
 * - Collapsible filter sections
 * - Date range, speaker, and topic filters
 */
export const FilterSidebar: React.FC<FilterSidebarProps> = ({
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
  const [expandedSections, setExpandedSections] = useState({
    dateRange: true,
    speakers: true,
    topics: true
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="w-[300px] bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-fit sticky top-6">
      {/* Header with clear all */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">Filters</h2>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="gap-1 text-slate-600 hover:text-slate-900"
          >
            <X size={14} />
            Clear all
          </Button>
        )}
      </div>

      {/* Date Range Section */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection('dateRange')}
          className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <span>Date Range</span>
          {expandedSections.dateRange ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>
        {expandedSections.dateRange && (
          <div className="mt-2 pl-1">
            <DateRangeFilter
              dateRange={filters.dateRange}
              customStart={filters.customStart}
              customEnd={filters.customEnd}
              onDateRangeChange={onDateRangeChange}
              onCustomDateChange={onCustomDateChange}
            />
          </div>
        )}
      </div>

      {/* Speakers Section */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection('speakers')}
          className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <span>
            Speakers
            {filters.speakers.length > 0 && (
              <span className="ml-1.5 text-xs text-blue-600 font-semibold">
                ({filters.speakers.length})
              </span>
            )}
          </span>
          {expandedSections.speakers ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>
        {expandedSections.speakers && (
          <div className="mt-2 pl-1 max-h-48 overflow-y-auto">
            <SpeakerFilter
              selectedSpeakers={filters.speakers}
              speakerOptions={speakerOptions}
              onToggleSpeaker={onToggleSpeaker}
            />
          </div>
        )}
      </div>

      {/* Topics Section */}
      <div>
        <button
          onClick={() => toggleSection('topics')}
          className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <span>
            Topics
            {filters.topics.length > 0 && (
              <span className="ml-1.5 text-xs text-blue-600 font-semibold">
                ({filters.topics.length})
              </span>
            )}
          </span>
          {expandedSections.topics ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>
        {expandedSections.topics && (
          <div className="mt-2 pl-1 max-h-64 overflow-y-auto">
            <TopicFilter
              selectedTopics={filters.topics}
              topicOptions={topicOptions}
              onToggleTopic={onToggleTopic}
            />
          </div>
        )}
      </div>
    </div>
  );
};
