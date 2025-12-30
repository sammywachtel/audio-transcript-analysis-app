import { Conversation, Segment } from '../types';
import { extractSnippet } from '../utils/textHighlight';
import { SearchFilters } from '../hooks/useSearchFilters';

/**
 * searchService - Client-side full-text search within conversations
 *
 * Searches across all conversation segments and returns ranked results
 * grouped by conversation. No Firestore indexes required since this runs
 * entirely client-side on already-loaded conversation data.
 */

export interface SegmentMatch {
  segmentId: string;
  conversationId: string;
  segment: Segment;
  snippet: string;
  matchCount: number; // Number of times the search term appears in this segment
}

export interface ConversationSearchResult {
  conversationId: string;
  conversation: Conversation;
  matches: SegmentMatch[];
  totalMatches: number;
}

export interface SearchResults {
  results: ConversationSearchResult[];
  totalResults: number;
}

/**
 * Searches all conversations for segments matching the query
 *
 * @param conversations - All conversations to search
 * @param query - Search query string
 * @param contextChars - Characters of context around matches (default 50)
 * @returns Search results grouped by conversation
 */
export function searchConversations(
  conversations: Conversation[],
  query: string,
  contextChars: number = 50
): SearchResults {
  const trimmedQuery = query.trim();

  // Empty query returns no results
  if (!trimmedQuery) {
    return { results: [], totalResults: 0 };
  }

  const conversationResults: ConversationSearchResult[] = [];
  let totalResults = 0;

  for (const conversation of conversations) {
    // Skip incomplete conversations
    if (conversation.status !== 'complete') {
      continue;
    }

    const matches: SegmentMatch[] = [];

    for (const segment of conversation.segments) {
      const matchCount = countMatches(segment.text, trimmedQuery);

      if (matchCount > 0) {
        matches.push({
          segmentId: segment.segmentId,
          conversationId: conversation.conversationId,
          segment,
          snippet: extractSnippet(segment.text, trimmedQuery, contextChars),
          matchCount
        });
        totalResults++;
      }
    }

    // Only include conversations with matches
    if (matches.length > 0) {
      const totalMatches = matches.reduce((sum, m) => sum + m.matchCount, 0);
      conversationResults.push({
        conversationId: conversation.conversationId,
        conversation,
        matches,
        totalMatches
      });
    }
  }

  // Sort conversations by total match count (most relevant first)
  conversationResults.sort((a, b) => b.totalMatches - a.totalMatches);

  return {
    results: conversationResults,
    totalResults
  };
}

/**
 * Counts how many times a search term appears in text (case-insensitive)
 */
function countMatches(text: string, searchTerm: string): number {
  const lowerText = text.toLowerCase();
  const lowerTerm = searchTerm.toLowerCase();
  let count = 0;
  let pos = 0;

  while ((pos = lowerText.indexOf(lowerTerm, pos)) !== -1) {
    count++;
    pos += lowerTerm.length;
  }

  return count;
}

/**
 * Paginates search results
 *
 * @param results - All search results
 * @param limit - Number of segment matches to return (default 20)
 * @param offset - Number of matches to skip (default 0)
 * @returns Paginated results
 */
export function paginateResults(
  results: SearchResults,
  limit: number = 20,
  offset: number = 0
): SearchResults {
  // Flatten all matches across conversations
  const allMatches: { convResult: ConversationSearchResult; match: SegmentMatch }[] = [];

  for (const convResult of results.results) {
    for (const match of convResult.matches) {
      allMatches.push({ convResult, match });
    }
  }

  // Paginate the flat list
  const paginatedMatches = allMatches.slice(offset, offset + limit);

  // Re-group by conversation
  const conversationMap = new Map<string, ConversationSearchResult>();

  for (const { convResult, match } of paginatedMatches) {
    if (!conversationMap.has(convResult.conversationId)) {
      conversationMap.set(convResult.conversationId, {
        conversationId: convResult.conversationId,
        conversation: convResult.conversation,
        matches: [],
        totalMatches: convResult.totalMatches // Keep original total for display
      });
    }

    conversationMap.get(convResult.conversationId)!.matches.push(match);
  }

  return {
    results: Array.from(conversationMap.values()),
    totalResults: results.totalResults
  };
}

/**
 * Filters search results based on user-selected filters
 *
 * Applies date range, speaker, and topic filters to search results.
 * Filters are AND-ed together (all must pass).
 *
 * @param results - Search results to filter
 * @param filters - Active filters
 * @param conversations - Full conversation data (for accessing conversation.createdAt)
 * @returns Filtered results
 */
export function filterSearchResults(
  results: SearchResults,
  filters: SearchFilters,
  conversations: Conversation[]
): SearchResults {
  // Build conversation ID -> conversation map for quick lookups
  const conversationMap = new Map(
    conversations.map(conv => [conv.conversationId, conv])
  );

  const filteredConversationResults: ConversationSearchResult[] = [];
  let totalResults = 0;

  for (const convResult of results.results) {
    const conversation = conversationMap.get(convResult.conversationId);
    if (!conversation) continue;

    // Date range filter (applies to entire conversation)
    if (!passesDateFilter(conversation, filters)) {
      continue;
    }

    // Speaker and topic filters (apply to individual segments)
    const filteredMatches = convResult.matches.filter(match => {
      const passesSpeaker = passesSpeakerFilter(match, filters);
      const passesTopic = passesTopicFilter(conversation, match, filters);
      return passesSpeaker && passesTopic;
    });

    // Only include conversations that still have matches after filtering
    if (filteredMatches.length > 0) {
      const totalMatches = filteredMatches.reduce((sum, m) => sum + m.matchCount, 0);
      filteredConversationResults.push({
        conversationId: convResult.conversationId,
        conversation: convResult.conversation,
        matches: filteredMatches,
        totalMatches
      });
      totalResults += filteredMatches.length;
    }
  }

  // Re-sort by total match count
  filteredConversationResults.sort((a, b) => b.totalMatches - a.totalMatches);

  return {
    results: filteredConversationResults,
    totalResults
  };
}

/**
 * Check if conversation passes date range filter
 */
function passesDateFilter(conversation: Conversation, filters: SearchFilters): boolean {
  if (filters.dateRange === 'all') return true;

  const createdAt = new Date(conversation.createdAt);
  const now = new Date();

  switch (filters.dateRange) {
    case '7d':
      return createdAt >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return createdAt >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return createdAt >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'custom':
      if (filters.customStart && createdAt < filters.customStart) return false;
      if (filters.customEnd && createdAt > filters.customEnd) return false;
      return true;
    default:
      return true;
  }
}

/**
 * Check if segment match passes speaker filter
 */
function passesSpeakerFilter(match: SegmentMatch, filters: SearchFilters): boolean {
  // No speaker filter = pass all
  if (filters.speakers.length === 0) return true;

  // Check if segment's speaker is in the filter list
  return filters.speakers.includes(match.segment.speakerId);
}

/**
 * Check if segment match passes topic filter
 *
 * A segment passes if it falls within any of the selected topics' segment ranges.
 */
function passesTopicFilter(
  conversation: Conversation,
  match: SegmentMatch,
  filters: SearchFilters
): boolean {
  // No topic filter = pass all
  if (filters.topics.length === 0) return true;

  const segmentIndex = match.segment.index;

  // Check if segment falls within any selected topic's range
  return conversation.topics.some(topic => {
    if (!filters.topics.includes(topic.topicId)) return false;
    return segmentIndex >= topic.startIndex && segmentIndex <= topic.endIndex;
  });
}
