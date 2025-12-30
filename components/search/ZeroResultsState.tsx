import React from 'react';
import { SearchX } from 'lucide-react';

interface ZeroResultsStateProps {
  searchQuery: string;
}

/**
 * ZeroResultsState - Empty state when no search results found
 *
 * Provides helpful suggestions to the user on how to improve their search.
 */
export const ZeroResultsState: React.FC<ZeroResultsStateProps> = ({ searchQuery }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Icon */}
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <SearchX size={32} className="text-slate-400" />
      </div>

      {/* Message */}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No results for "{searchQuery}"
      </h3>

      {/* Suggestions */}
      <div className="max-w-md text-sm text-slate-600 space-y-2">
        <p>Try adjusting your search:</p>
        <ul className="list-disc list-inside text-left space-y-1 mt-3">
          <li>Check for typos or spelling errors</li>
          <li>Use fewer or different keywords</li>
          <li>Try more general terms</li>
          <li>Search for partial words (e.g., "analy" instead of "analysis")</li>
        </ul>
      </div>
    </div>
  );
};
