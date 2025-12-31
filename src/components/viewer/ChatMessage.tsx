/**
 * ChatMessage Component
 *
 * Renders user and assistant chat messages with:
 * - Timestamp citations as clickable links
 * - Per-message cost indicator
 * - Special styling for unanswerable responses
 */

import React from 'react';
import { User, Bot, Info, Play } from 'lucide-react';
import { cn } from '@/utils';
import { formatTime } from '@/utils';
import { CostIndicator } from '../shared/CostIndicator';
import { ChatHistoryMessage } from '@/services/chatHistoryService';
import { Speaker } from '@/config/types';

interface ChatMessageProps {
  message: ChatHistoryMessage;
  speakers: Record<string, Speaker>;
  onTimestampClick?: (segmentId: string, startMs: number) => void;
}

/**
 * ChatMessage - renders a single chat message (user or assistant)
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  speakers,
  onTimestampClick
}) => {
  const isUser = message.role === 'user';
  const isUnanswerable = message.isUnanswerable;

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg',
        isUser ? 'bg-blue-50/50' : isUnanswerable ? 'bg-slate-50' : 'bg-white border border-slate-200'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* Header: Role + Cost */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-500">
            {isUser ? 'You' : 'Assistant'}
          </span>
          {!isUser && message.costUsd !== undefined && (
            <CostIndicator cost={message.costUsd} size="sm" showIcon={false} showBreakdown={false} />
          )}
        </div>

        {/* Message Text */}
        <div className={cn(
          'text-sm leading-relaxed',
          isUnanswerable ? 'text-slate-500 italic' : 'text-slate-900'
        )}>
          {isUnanswerable && (
            <div className="flex items-start gap-2 mb-1">
              <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <span className="text-xs text-slate-500">
                This information couldn't be found in the transcript.
              </span>
            </div>
          )}
          {message.content}
        </div>

        {/* Timestamp Sources (only for answerable assistant messages) */}
        {!isUser && message.sources && message.sources.length > 0 && !isUnanswerable && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, idx) => {
                const speaker = source.speaker ? speakers[source.speaker] : null;
                const speakerName = speaker?.displayName || source.speaker || 'Unknown';
                const timestamp = source.startMs !== undefined ? formatTime(source.startMs) : '0:00';

                return (
                  <button
                    key={`${source.segmentId}-${idx}`}
                    onClick={() => {
                      if (onTimestampClick && source.segmentId && source.startMs !== undefined) {
                        onTimestampClick(source.segmentId, source.startMs);
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                      'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100',
                      'transition-colors cursor-pointer',
                      'font-medium'
                    )}
                    title={`Jump to ${timestamp} - ${speakerName}`}
                  >
                    <Play size={10} className="fill-current" />
                    <span>{timestamp}</span>
                    {speakerName && (
                      <>
                        <span className="text-blue-400">-</span>
                        <span className="text-blue-600">{speakerName}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-1.5 text-[10px] text-slate-400">
          {message.createdAt
            ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now'}
        </div>
      </div>
    </div>
  );
};
