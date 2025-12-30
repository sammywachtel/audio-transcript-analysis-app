import React, { useEffect, useCallback, useState } from 'react';
import { useConversations } from '../contexts/ConversationContext';
import { useSearch } from '../hooks/useSearch';
import { useSearchFilters } from '../hooks/useSearchFilters';
import { SearchResults } from '../components/search/SearchResults';
import { FilterSidebar } from '../components/search/FilterSidebar';
import { FilterBottomSheet } from '../components/search/FilterBottomSheet';
import { UserMenu } from '../components/auth/UserMenu';
import { ArrowLeft, Search as SearchIcon, Filter } from 'lucide-react';
import { Button } from '../components/Button';

interface SearchProps {
  onBack: () => void;
  onOpenConversation: (conversationId: string, targetSegmentId?: string) => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}

/**
 * Search - Full-text search page
 *
 * Allows users to search across all transcript segments with:
 * - Real-time search with debouncing
 * - Grouped results by conversation
 * - Highlighted snippets with context
 * - Pagination (20 results initially, "Load more" for additional)
 * - URL synchronization (managed by App component)
 */
export const Search: React.FC<SearchProps> = ({
  onBack,
  onOpenConversation,
  initialQuery = '',
  onQueryChange
}) => {
  const { conversations, isLoaded } = useConversations();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Filter state
  const {
    filters,
    setDateRange,
    setCustomDateRange,
    toggleSpeaker,
    toggleTopic,
    clearAll,
    activeFilterCount
  } = useSearchFilters();

  // Search with filters
  const {
    query,
    setQuery,
    results,
    isLoading,
    hasMore,
    loadMore,
    speakerOptions,
    topicOptions
  } = useSearch({
    conversations,
    initialQuery,
    resultsPerPage: 20,
    filters
  });

  // Notify parent of query changes (for URL sync)
  useEffect(() => {
    if (onQueryChange) {
      onQueryChange(query);
    }
  }, [query, onQueryChange]);

  const handleOpenInViewer = useCallback((conversationId: string, segmentId: string) => {
    onOpenConversation(conversationId, segmentId);
  }, [onOpenConversation]);

  // Loading state for conversation data
  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      {/* Mobile filter bottom sheet */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filters={filters}
        activeFilterCount={activeFilterCount}
        speakerOptions={speakerOptions}
        topicOptions={topicOptions}
        onDateRangeChange={setDateRange}
        onCustomDateChange={setCustomDateRange}
        onToggleSpeaker={toggleSpeaker}
        onToggleTopic={toggleTopic}
        onClearAll={clearAll}
      />

      {/* Main content */}
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft size={18} />
            Back to Library
          </Button>
          <UserMenu />
        </div>

        {/* Search Input */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Search Conversations</h1>
            {/* Mobile filter button */}
            <Button
              variant="outline"
              onClick={() => setIsFilterSheetOpen(true)}
              className="md:hidden gap-2"
            >
              <Filter size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all transcripts..."
              autoFocus
              className="w-full pl-12 pr-4 py-3 rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Results with sidebar layout */}
        <div className="flex gap-6 items-start">
          {/* Desktop filter sidebar */}
          <div className="hidden md:block flex-shrink-0">
            <FilterSidebar
              filters={filters}
              activeFilterCount={activeFilterCount}
              speakerOptions={speakerOptions}
              topicOptions={topicOptions}
              onDateRangeChange={setDateRange}
              onCustomDateChange={setCustomDateRange}
              onToggleSpeaker={toggleSpeaker}
              onToggleTopic={toggleTopic}
              onClearAll={clearAll}
            />
          </div>

          {/* Results */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <SearchResults
              results={results}
              searchQuery={query}
              isLoading={isLoading}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onOpenInViewer={handleOpenInViewer}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
