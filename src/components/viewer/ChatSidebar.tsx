/**
 * ChatSidebar Component
 *
 * Main chat panel for the Viewer sidebar.
 * Features:
 * - Header with conversation title and duration
 * - Chat history controls (clear, export, limit warnings)
 * - Pagination ("Load older" button)
 * - Empty state with rotating question suggestions
 * - Progressive cost transparency warnings
 * - Scrollable message list
 * - Fixed input at bottom (disabled when at 50 message limit)
 * - Mobile-friendly with 44px touch targets
 */

import React, { useRef, useEffect } from 'react';
import { MessageSquare, AlertCircle, Loader2, ChevronUp, DollarSign, Info } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatHistory } from './ChatHistory';
import { QuestionSuggestions } from './QuestionSuggestions';
import { ChatHistoryMessage } from '@/services/chatHistoryService';
import { Speaker } from '@/config/types';
import { formatTime } from '@/utils';

interface ChatSidebarProps {
  conversationId: string;
  title: string;
  durationMs: number;
  messages: ChatHistoryMessage[];
  messageCount: number;
  draftInput: string;
  setDraftInput: (input: string) => void;
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isAtLimit: boolean; // True when at 50 message limit
  error: string | null;
  onClearError: () => void;
  speakers: Record<string, Speaker>;
  onSeek?: (timeMs: number) => void;
  onPlay?: () => void;
  onHighlight?: (segmentId: string | null) => void;
  onClearHistoryComplete: () => void; // Callback after clearing history
  hasOlderMessages: boolean;
  onLoadOlder: () => Promise<void>;
  isLoadingOlder: boolean;
  // New props for enhanced features
  suggestions?: string[];
  cumulativeCostUsd?: number;
  costWarningLevel?: 'none' | 'primary' | 'escalated';
}

/**
 * ChatSidebar - main chat interface with persistence
 */
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversationId,
  title,
  durationMs,
  messages,
  messageCount,
  draftInput,
  setDraftInput,
  onSendMessage,
  isLoading,
  isAtLimit,
  error,
  onClearError,
  speakers,
  onSeek,
  onPlay,
  onHighlight,
  onClearHistoryComplete,
  hasOlderMessages,
  onLoadOlder,
  isLoadingOlder,
  suggestions = [],
  cumulativeCostUsd = 0,
  costWarningLevel = 'none'
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Track last message for showing suggestions after unanswerable responses
  const lastMessage = messages[messages.length - 1];
  const showSuggestionsAfterResponse = lastMessage?.role === 'assistant' && lastMessage?.isUnanswerable;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSubmit = () => {
    if (draftInput.trim() && !isLoading && !isAtLimit) {
      onSendMessage(draftInput.trim());
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <MessageSquare size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-slate-900 truncate" title={title}>
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Duration: {formatTime(durationMs)}
            </p>
          </div>
        </div>
      </div>

      {/* Chat History Controls */}
      <ChatHistory
        conversationId={conversationId}
        conversationTitle={title}
        messageCount={messageCount}
        onClearComplete={onClearHistoryComplete}
      />

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button
            onClick={onClearError}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Limit Warning Banner */}
      {isAtLimit && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800 font-medium">Chat limit reached</p>
            <p className="text-sm text-red-700 mt-1">
              Clear some history to continue chatting. Maximum 50 messages per conversation.
            </p>
          </div>
        </div>
      )}

      {/* Progressive Cost Warning Banner */}
      {costWarningLevel === 'primary' && (
        <div className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
          <DollarSign size={16} className="text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-yellow-800 font-medium">
              Cost notice: ${cumulativeCostUsd.toFixed(2)} spent
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              You've used ${cumulativeCostUsd.toFixed(2)} in chat costs for this conversation.
            </p>
          </div>
        </div>
      )}

      {costWarningLevel === 'escalated' && (
        <div className="mx-4 mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
          <DollarSign size={16} className="text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-orange-800 font-medium">
              High cost alert: ${cumulativeCostUsd.toFixed(2)} spent
            </p>
            <p className="text-sm text-orange-700 mt-1">
              This conversation has exceeded $1.25 in chat costs. Consider starting a new conversation or being more selective with questions.
            </p>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <EmptyState
            conversationId={conversationId}
            suggestions={suggestions}
            onSuggestionClick={(suggestion) => {
              setDraftInput(suggestion);
              onSendMessage(suggestion);
            }}
          />
        ) : (
          <>
            {/* Load Older Button */}
            {hasOlderMessages && (
              <div className="flex justify-center pb-3">
                <button
                  onClick={onLoadOlder}
                  disabled={isLoadingOlder}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingOlder ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp size={14} />
                      <span>Load older messages</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Message List */}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                speakers={speakers}
                conversationId={conversationId}
                onSeek={onSeek}
                onPlay={onPlay}
                onHighlight={onHighlight}
              />
            ))}

            {/* Show suggestions after unanswerable response */}
            {showSuggestionsAfterResponse && suggestions.length > 0 && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-600">
                    That question couldn't be answered from the transcript. Try one of these instead:
                  </p>
                </div>
                <QuestionSuggestions
                  conversationId={conversationId}
                  suggestions={suggestions}
                  onSuggestionClick={(suggestion) => {
                    setDraftInput(suggestion);
                    onSendMessage(suggestion);
                  }}
                  showHeader={false}
                />
              </div>
            )}

            {/* Loading indicator for new messages */}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-500 text-sm p-3">
                <Loader2 size={16} className="animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input (Fixed at bottom) */}
      <ChatInput
        value={draftInput}
        onChange={setDraftInput}
        onSubmit={handleSubmit}
        disabled={isLoading || isAtLimit}
      />
    </div>
  );
};

/**
 * Empty state shown when no messages yet
 */
interface EmptyStateProps {
  conversationId: string;
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ conversationId, suggestions, onSuggestionClick }) => {
  return (
    <div className="text-center py-8 px-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <MessageSquare size={24} className="text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">
        Chat with your transcript
      </h3>
      <p className="text-sm text-slate-500 mb-4 leading-relaxed">
        Ask questions about the conversation and get answers with timestamp citations.
      </p>

      {/* Question Suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-6">
          <QuestionSuggestions
            conversationId={conversationId}
            suggestions={suggestions}
            onSuggestionClick={onSuggestionClick}
          />
        </div>
      )}
    </div>
  );
};
