import React from 'react';
import { SpeakerOption } from '../../hooks/useSearch';

interface SpeakerFilterProps {
  selectedSpeakers: string[];
  speakerOptions: SpeakerOption[];
  onToggleSpeaker: (speakerId: string) => void;
}

/**
 * SpeakerFilter - Speaker selection filter with match counts
 *
 * Displays checkboxes for each speaker found in the current search results.
 * Shows match counts to help users understand filter impact.
 */
export const SpeakerFilter: React.FC<SpeakerFilterProps> = ({
  selectedSpeakers,
  speakerOptions,
  onToggleSpeaker
}) => {
  // Show message if no speakers available
  if (speakerOptions.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        No speakers found in results
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {speakerOptions.map((option) => (
        <label
          key={option.speakerId}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={selectedSpeakers.includes(option.speakerId)}
            onChange={() => onToggleSpeaker(option.speakerId)}
            className="text-blue-500 focus:ring-blue-500 rounded"
          />
          <span className="text-sm text-slate-700 flex-1 group-hover:text-slate-900">
            {option.displayName}
          </span>
          <span className="text-xs text-slate-400 tabular-nums">
            {option.matchCount}
          </span>
        </label>
      ))}
    </div>
  );
};
