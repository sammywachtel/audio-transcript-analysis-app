import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { searchConversations, paginateResults, filterSearchResults, SearchResults } from '../services/searchService';
import { Conversation, Speaker, Topic } from '../types';
import { SearchFilters } from './useSearchFilters';

interface UseSearchOptions {
  conversations: Conversation[];
  initialQuery?: string;
  resultsPerPage?: number;
  filters?: SearchFilters; // Optional filters
}

export interface SpeakerOption {
  speakerId: string;
  displayName: string;
  matchCount: number;
}

export interface TopicOption {
  topicId: string;
  title: string;
  matchCount: number;
}

interface UseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResults;
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  // Derived filter options from current results
  speakerOptions: SpeakerOption[];
  topicOptions: TopicOption[];
}

/**
 * useSearch - Orchestrates search state, debouncing, filtering, and pagination
 *
 * Manages:
 * - Search query state
 * - Debounced search execution (prevents searching on every keystroke)
 * - Filter application (after search, before pagination)
 * - Pagination with "load more" functionality
 * - Loading state during debounce delay
 * - Derived speaker/topic options from filtered results
 * - URL synchronization (handled by parent component)
 */
export function useSearch({
  conversations,
  initialQuery = '',
  resultsPerPage = 20,
  filters
}: UseSearchOptions): UseSearchReturn {
  const [query, setQuery] = useState(initialQuery);
  const [offset, setOffset] = useState(0);

  // Debounce the query to avoid searching on every keystroke
  const debouncedQuery = useDebounce(query, 300);

  // Loading state: true during debounce delay
  const isLoading = query !== debouncedQuery && query.trim() !== '';

  // Reset pagination when query or filters change
  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, filters]);

  // Sync initialQuery prop to state (for back/forward navigation)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Perform search (memoized to avoid re-running on every render)
  const allResults = useMemo(() => {
    return searchConversations(conversations, debouncedQuery);
  }, [conversations, debouncedQuery]);

  // Apply filters to search results (before pagination)
  const filteredResults = useMemo(() => {
    if (!filters) return allResults;
    return filterSearchResults(allResults, filters, conversations);
  }, [allResults, filters, conversations]);

  // Derive speaker options from filtered results
  const speakerOptions = useMemo(() => {
    return deriveSpeakerOptions(filteredResults);
  }, [filteredResults]);

  // Derive topic options from filtered results
  const topicOptions = useMemo(() => {
    return deriveTopicOptions(filteredResults);
  }, [filteredResults]);

  // Paginate results
  const paginatedResults = useMemo(() => {
    return paginateResults(filteredResults, offset + resultsPerPage, 0);
  }, [filteredResults, offset, resultsPerPage]);

  // Check if there are more results to load
  const hasMore = paginatedResults.totalResults > offset + resultsPerPage;

  // Load more handler
  const loadMore = () => {
    setOffset(prev => prev + resultsPerPage);
  };

  return {
    query,
    setQuery,
    results: paginatedResults,
    isLoading,
    hasMore,
    loadMore,
    speakerOptions,
    topicOptions
  };
}

/**
 * Derive speaker options from search results with match counts
 */
function deriveSpeakerOptions(results: SearchResults): SpeakerOption[] {
  const speakerCounts = new Map<string, { speaker: Speaker; count: number }>();

  for (const convResult of results.results) {
    for (const match of convResult.matches) {
      const speakerId = match.segment.speakerId;
      const speaker = convResult.conversation.speakers[speakerId];

      if (speaker) {
        const existing = speakerCounts.get(speakerId);
        if (existing) {
          existing.count += match.matchCount;
        } else {
          speakerCounts.set(speakerId, { speaker, count: match.matchCount });
        }
      }
    }
  }

  // Convert to array and sort by match count
  return Array.from(speakerCounts.values())
    .map(({ speaker, count }) => ({
      speakerId: speaker.speakerId,
      displayName: speaker.displayName,
      matchCount: count
    }))
    .sort((a, b) => b.matchCount - a.matchCount);
}

/**
 * Derive topic options from search results with match counts
 */
function deriveTopicOptions(results: SearchResults): TopicOption[] {
  const topicCounts = new Map<string, { topic: Topic; count: number }>();

  for (const convResult of results.results) {
    // For each match, find which topic(s) it belongs to
    for (const match of convResult.matches) {
      const segmentIndex = match.segment.index;

      for (const topic of convResult.conversation.topics) {
        if (segmentIndex >= topic.startIndex && segmentIndex <= topic.endIndex) {
          const existing = topicCounts.get(topic.topicId);
          if (existing) {
            existing.count += match.matchCount;
          } else {
            topicCounts.set(topic.topicId, { topic, count: match.matchCount });
          }
        }
      }
    }
  }

  // Convert to array and sort by match count
  return Array.from(topicCounts.values())
    .map(({ topic, count }) => ({
      topicId: topic.topicId,
      title: topic.title,
      matchCount: count
    }))
    .sort((a, b) => b.matchCount - a.matchCount);
}
