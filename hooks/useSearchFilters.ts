import { useState, useEffect, useCallback } from 'react';

export interface SearchFilters {
  dateRange: 'all' | '7d' | '30d' | '90d' | 'custom';
  customStart?: Date;
  customEnd?: Date;
  speakers: string[]; // Array of speakerIds
  topics: string[]; // Array of topicIds
}

interface UseSearchFiltersReturn {
  filters: SearchFilters;
  setDateRange: (range: SearchFilters['dateRange']) => void;
  setCustomDateRange: (start: Date | undefined, end: Date | undefined) => void;
  setSpeakers: (speakers: string[]) => void;
  setTopics: (topics: string[]) => void;
  toggleSpeaker: (speakerId: string) => void;
  toggleTopic: (topicId: string) => void;
  clearAll: () => void;
  activeFilterCount: number;
}

const DEFAULT_FILTERS: SearchFilters = {
  dateRange: 'all',
  speakers: [],
  topics: []
};

const STORAGE_KEY = 'search_filters';

/**
 * useSearchFilters - Manages search filter state with URL and sessionStorage sync
 *
 * Filter state is persisted in:
 * 1. URL query params (primary source, enables sharing)
 * 2. sessionStorage (fallback when URL is empty)
 *
 * URL params:
 * - dateRange: 'all' | '7d' | '30d' | '90d' | 'custom'
 * - from: ISO date string (for custom range)
 * - to: ISO date string (for custom range)
 * - speakers: comma-separated speaker IDs
 * - topics: comma-separated topic IDs
 */
export function useSearchFilters(): UseSearchFiltersReturn {
  const [filters, setFilters] = useState<SearchFilters>(() => {
    // Initialize from URL or sessionStorage
    return parseFiltersFromUrl() || loadFiltersFromStorage() || DEFAULT_FILTERS;
  });

  // Sync filters to URL and sessionStorage whenever they change
  useEffect(() => {
    syncFiltersToUrl(filters);
    saveFiltersToStorage(filters);
  }, [filters]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlFilters = parseFiltersFromUrl();
      if (urlFilters) {
        setFilters(urlFilters);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Filter setters
  const setDateRange = useCallback((range: SearchFilters['dateRange']) => {
    setFilters(prev => ({
      ...prev,
      dateRange: range,
      // Clear custom dates if switching away from custom
      customStart: range === 'custom' ? prev.customStart : undefined,
      customEnd: range === 'custom' ? prev.customEnd : undefined
    }));
  }, []);

  const setCustomDateRange = useCallback((start: Date | undefined, end: Date | undefined) => {
    setFilters(prev => ({
      ...prev,
      dateRange: 'custom',
      customStart: start,
      customEnd: end
    }));
  }, []);

  const setSpeakers = useCallback((speakers: string[]) => {
    setFilters(prev => ({ ...prev, speakers }));
  }, []);

  const setTopics = useCallback((topics: string[]) => {
    setFilters(prev => ({ ...prev, topics }));
  }, []);

  const toggleSpeaker = useCallback((speakerId: string) => {
    setFilters(prev => ({
      ...prev,
      speakers: prev.speakers.includes(speakerId)
        ? prev.speakers.filter(id => id !== speakerId)
        : [...prev.speakers, speakerId]
    }));
  }, []);

  const toggleTopic = useCallback((topicId: string) => {
    setFilters(prev => ({
      ...prev,
      topics: prev.topics.includes(topicId)
        ? prev.topics.filter(id => id !== topicId)
        : [...prev.topics, topicId]
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // Calculate active filter count (excluding 'all' date range)
  const activeFilterCount =
    (filters.dateRange !== 'all' ? 1 : 0) +
    filters.speakers.length +
    filters.topics.length;

  return {
    filters,
    setDateRange,
    setCustomDateRange,
    setSpeakers,
    setTopics,
    toggleSpeaker,
    toggleTopic,
    clearAll,
    activeFilterCount
  };
}

/**
 * Parse filters from URL query params
 */
function parseFiltersFromUrl(): SearchFilters | null {
  const params = new URLSearchParams(window.location.search);

  const dateRange = params.get('dateRange') as SearchFilters['dateRange'] | null;
  const from = params.get('from');
  const to = params.get('to');
  const speakersParam = params.get('speakers');
  const topicsParam = params.get('topics');

  // If no filter params exist, return null
  if (!dateRange && !speakersParam && !topicsParam) {
    return null;
  }

  return {
    dateRange: dateRange || 'all',
    customStart: from ? new Date(from) : undefined,
    customEnd: to ? new Date(to) : undefined,
    speakers: speakersParam ? speakersParam.split(',').filter(Boolean) : [],
    topics: topicsParam ? topicsParam.split(',').filter(Boolean) : []
  };
}

/**
 * Sync filters to URL query params (replaceState to avoid polluting history)
 */
function syncFiltersToUrl(filters: SearchFilters): void {
  const params = new URLSearchParams(window.location.search);

  // Date range
  if (filters.dateRange !== 'all') {
    params.set('dateRange', filters.dateRange);
  } else {
    params.delete('dateRange');
  }

  // Custom date range
  if (filters.dateRange === 'custom' && filters.customStart) {
    params.set('from', filters.customStart.toISOString());
  } else {
    params.delete('from');
  }

  if (filters.dateRange === 'custom' && filters.customEnd) {
    params.set('to', filters.customEnd.toISOString());
  } else {
    params.delete('to');
  }

  // Speakers
  if (filters.speakers.length > 0) {
    params.set('speakers', filters.speakers.join(','));
  } else {
    params.delete('speakers');
  }

  // Topics
  if (filters.topics.length > 0) {
    params.set('topics', filters.topics.join(','));
  } else {
    params.delete('topics');
  }

  const newUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, '', newUrl);
}

/**
 * Load filters from sessionStorage
 */
function loadFiltersFromStorage(): SearchFilters | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Restore Date objects from ISO strings
    return {
      ...parsed,
      customStart: parsed.customStart ? new Date(parsed.customStart) : undefined,
      customEnd: parsed.customEnd ? new Date(parsed.customEnd) : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Save filters to sessionStorage
 */
function saveFiltersToStorage(filters: SearchFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}
