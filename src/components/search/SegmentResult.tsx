import React, { useRef } from 'react';
import { SegmentMatch } from '../../services/searchService';
import { highlightMatches } from '../../utils/textHighlight';
import { formatTime } from '@/utils';
import { Clock } from 'lucide-react';

interface SegmentResultProps {
  match: SegmentMatch;
  searchQuery: string;
  onOpenInViewer: (conversationId: string, segmentId: string) => void;
  onPreview?: (match: SegmentMatch, buttonRef: React.RefObject<HTMLButtonElement>) => void;
}

/**
 * SegmentResult - Individual search result showing a matching segment
 *
 * Displays:
 * - Timestamp of when the segment occurs
 * - Snippet with highlighted search terms
 * - "Open in Viewer" action to jump to this segment
 */
export const SegmentResult: React.FC<SegmentResultProps> = ({
  match,
  searchQuery,
  onOpenInViewer,
  onPreview
}) => {
  const highlightedSegments = highlightMatches(match.snippet, searchQuery);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="border-l-2 border-slate-200 pl-3 py-2 hover:border-blue-400 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Timestamp */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <Clock size={12} />
            <span>{formatTime(match.segment.startMs)}</span>
          </div>

          {/* Snippet with highlighting */}
          <p className="text-sm text-slate-700 leading-relaxed">
            {highlightedSegments.map((seg, idx) => (
              seg.isMatch ? (
                <mark
                  key={idx}
                  className="bg-yellow-200 text-slate-900 font-medium px-0.5 rounded"
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={idx}>{seg.text}</span>
              )
            ))}
          </p>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100">
          {/* Preview button */}
          {onPreview && (
            <button
              ref={previewButtonRef}
              onClick={() => onPreview(match, previewButtonRef)}
              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              Preview
            </button>
          )}

          {/* Open in Viewer button */}
          <button
            onClick={() => onOpenInViewer(match.conversationId, match.segmentId)}
            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
};
