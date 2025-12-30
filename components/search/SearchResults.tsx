import React from 'react';
import { SearchResults as SearchResultsType, SegmentMatch } from '../../services/searchService';
import { ConversationResultCard } from './ConversationResultCard';
import { ZeroResultsState } from './ZeroResultsState';
import { Button } from '../Button';
import { Loader2 } from 'lucide-react';
import { Conversation } from '../../types';

interface SearchResultsProps {
  results: SearchResultsType;
  searchQuery: string;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenInViewer: (conversationId: string, segmentId: string) => void;
  onPreview?: (match: SegmentMatch, buttonRef: React.RefObject<HTMLButtonElement>, conversation: Conversation) => void;
}

/**
 * SearchResults - Orchestrates search results display
 *
 * Handles:
 * - Loading state
 * - Zero results state
 * - Grouped conversation results
 * - Pagination with "Load more" button
 */
export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  searchQuery,
  isLoading,
  hasMore,
  onLoadMore,
  onOpenInViewer,
  onPreview
}) => {
  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
        <p className="text-slate-600">Searching conversations...</p>
      </div>
    );
  }

  // Empty query state - show prompt to search
  if (!searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-slate-500">Enter a search term to find transcript segments</p>
      </div>
    );
  }

  // Zero results state
  if (results.totalResults === 0) {
    return <ZeroResultsState searchQuery={searchQuery} />;
  }

  // Results
  return (
    <div className="space-y-4">
      {/* Results header */}
      <div className="text-sm text-slate-600">
        Found <span className="font-semibold text-slate-900">{results.totalResults}</span> match{results.totalResults !== 1 ? 'es' : ''} across{' '}
        <span className="font-semibold text-slate-900">{results.results.length}</span> conversation{results.results.length !== 1 ? 's' : ''}
      </div>

      {/* Conversation result cards */}
      <div className="space-y-3">
        {results.results.map((result) => (
          <ConversationResultCard
            key={result.conversationId}
            result={result}
            searchQuery={searchQuery}
            onOpenInViewer={onOpenInViewer}
            onPreview={onPreview}
          />
        ))}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            onClick={onLoadMore}
            className="gap-2"
          >
            Load more results
          </Button>
        </div>
      )}
    </div>
  );
};
