import React from 'react';
import { TopicOption } from '../../hooks/useSearch';

interface TopicFilterProps {
  selectedTopics: string[];
  topicOptions: TopicOption[];
  onToggleTopic: (topicId: string) => void;
}

/**
 * TopicFilter - Topic selection filter with match counts
 *
 * Displays checkboxes for each topic found in the current search results.
 * Shows match counts to help users understand filter impact.
 */
export const TopicFilter: React.FC<TopicFilterProps> = ({
  selectedTopics,
  topicOptions,
  onToggleTopic
}) => {
  // Show message if no topics available
  if (topicOptions.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        No topics found in results
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {topicOptions.map((option) => (
        <label
          key={option.topicId}
          className="flex items-start gap-2 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={selectedTopics.includes(option.topicId)}
            onChange={() => onToggleTopic(option.topicId)}
            className="text-blue-500 focus:ring-blue-500 rounded mt-0.5"
          />
          <span className="text-sm text-slate-700 flex-1 group-hover:text-slate-900 leading-snug">
            {option.title}
          </span>
          <span className="text-xs text-slate-400 tabular-nums mt-0.5">
            {option.matchCount}
          </span>
        </label>
      ))}
    </div>
  );
};
