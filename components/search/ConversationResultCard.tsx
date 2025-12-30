import React from 'react';
import { ConversationSearchResult } from '../../services/searchService';
import { SegmentResult } from './SegmentResult';
import { FileAudio, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../utils';

interface ConversationResultCardProps {
  result: ConversationSearchResult;
  searchQuery: string;
  onOpenInViewer: (conversationId: string, segmentId: string) => void;
  defaultExpanded?: boolean;
}

/**
 * ConversationResultCard - Groups search results by conversation
 *
 * Shows:
 * - Conversation title and metadata
 * - Match count for this conversation
 * - Collapsible list of matching segments
 */
export const ConversationResultCard: React.FC<ConversationResultCardProps> = ({
  result,
  searchQuery,
  onOpenInViewer,
  defaultExpanded = true
}) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {/* Conversation Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        {/* Expand/Collapse Icon */}
        <div className="shrink-0 text-slate-400">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        {/* Conversation Icon */}
        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <FileAudio size={20} />
        </div>

        {/* Title and metadata */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-slate-900 truncate">
            {result.conversation.title}
          </h3>
          <p className="text-xs text-slate-500">
            {result.matches.length} segment{result.matches.length !== 1 ? 's' : ''} • {result.totalMatches} match{result.totalMatches !== 1 ? 'es' : ''}
          </p>
        </div>

        {/* Date */}
        <div className="text-sm text-slate-500 shrink-0">
          {new Date(result.conversation.createdAt).toLocaleDateString()}
        </div>
      </button>

      {/* Matching Segments */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-slate-100">
          <div className="pt-3 space-y-1">
            {result.matches.map((match) => (
              <SegmentResult
                key={match.segmentId}
                match={match}
                searchQuery={searchQuery}
                onOpenInViewer={onOpenInViewer}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
