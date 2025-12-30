/**
 * textHighlight - Utilities for highlighting search matches in text
 *
 * Handles case-insensitive search term highlighting with context windows
 * for snippets. Used for search result previews and in-transcript highlighting.
 */

export interface HighlightedSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Splits text into segments with matches highlighted
 *
 * Example: highlightMatches("The quick brown fox", "quick")
 * Returns: [{text: "The ", isMatch: false}, {text: "quick", isMatch: true}, {text: " brown fox", isMatch: false}]
 */
export function highlightMatches(text: string, searchTerm: string): HighlightedSegment[] {
  if (!searchTerm.trim()) {
    return [{ text, isMatch: false }];
  }

  const segments: HighlightedSegment[] = [];
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  const parts = text.split(regex);

  for (const part of parts) {
    if (part) {
      const isMatch = regex.test(part);
      // Reset regex after test (stateful regex gotcha)
      regex.lastIndex = 0;
      segments.push({
        text: part,
        isMatch: isMatch || part.toLowerCase() === searchTerm.toLowerCase()
      });
    }
  }

  return segments;
}

/**
 * Extracts a snippet with context around the first match
 *
 * @param text - Full text to extract from
 * @param searchTerm - Term to search for
 * @param contextChars - Characters of context before/after match (default 50)
 * @returns Snippet with "..." prefix/suffix if truncated
 */
export function extractSnippet(
  text: string,
  searchTerm: string,
  contextChars: number = 50
): string {
  if (!searchTerm.trim()) {
    // No search term - return start of text
    return text.length > contextChars * 2
      ? text.slice(0, contextChars * 2) + '...'
      : text;
  }

  // Find first match (case-insensitive)
  const lowerText = text.toLowerCase();
  const lowerTerm = searchTerm.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerTerm);

  if (matchIndex === -1) {
    // No match found - shouldn't happen but handle gracefully
    return text.length > contextChars * 2
      ? text.slice(0, contextChars * 2) + '...'
      : text;
  }

  // Calculate snippet boundaries
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + searchTerm.length + contextChars);

  let snippet = text.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < text.length) {
    snippet = snippet + '...';
  }

  return snippet;
}

/**
 * Escapes special regex characters in user input
 * Prevents regex injection from search terms like "hello (world)"
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
