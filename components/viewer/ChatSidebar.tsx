/**
 * ChatSidebar Component
 *
 * Main chat panel for the Viewer sidebar.
 * Features:
 * - Header with conversation title and duration
 * - Empty state with example questions
 * - Scrollable message list
 * - Fixed input at bottom
 */

import React, { useRef, useEffect } from 'react';
import { MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatMessage as ChatMessageType } from '../../hooks/useChat';
import { Speaker } from '../../types';
import { formatTime } from '../../utils';

interface ChatSidebarProps {
  title: string;
  durationMs: number;
  messages: ChatMessageType[];
  draftInput: string;
  setDraftInput: (input: string) => void;
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
  speakers: Record<string, Speaker>;
  onTimestampClick?: (segmentId: string, startMs: number) => void;
}

/**
 * ChatSidebar - main chat interface
 */
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  title,
  durationMs,
  messages,
  draftInput,
  setDraftInput,
  onSendMessage,
  isLoading,
  error,
  onClearError,
  speakers,
  onTimestampClick
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSubmit = () => {
    if (draftInput.trim() && !isLoading) {
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                speakers={speakers}
                onTimestampClick={onTimestampClick}
              />
            ))}
            {/* Loading indicator */}
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
        disabled={isLoading}
      />
    </div>
  );
};

/**
 * Empty state shown when no messages yet
 */
const EmptyState: React.FC = () => {
  const exampleQuestions = [
    'What are the main topics discussed?',
    'Who are the key people mentioned?',
    'What decisions were made?',
    'Can you summarize the conversation?'
  ];

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

      {/* Example Questions */}
      <div className="mt-6">
        <p className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-3">
          Try asking:
        </p>
        <div className="space-y-2">
          {exampleQuestions.map((question, idx) => (
            <div
              key={idx}
              className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left"
            >
              "{question}"
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
