/**
 * ChatHistory Component
 *
 * Controls for chat history management:
 * - Message count display with limit warnings
 * - Clear history button with confirmation modal
 * - Export history to JSON
 * - Warning at 45 messages, block at 50
 */

import React, { useState, useEffect } from 'react';
import { Trash2, Download, AlertTriangle, X } from 'lucide-react';
import { Button } from '../Button';
import { chatHistoryService } from '@/services/chatHistoryService';

interface ChatHistoryProps {
  conversationId: string;
  conversationTitle: string;
  messageCount: number;
  onClearComplete: () => void; // Callback after clearing to refresh count
}

/**
 * ChatHistory - History management controls
 *
 * Shows message count with visual warnings:
 * - Green: 0-44 messages (normal)
 * - Yellow: 45-49 messages (warning)
 * - Red: 50 messages (blocked)
 */
export const ChatHistory: React.FC<ChatHistoryProps> = ({
  conversationId,
  conversationTitle,
  messageCount,
  onClearComplete
}) => {
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Determine status based on message count
  const isWarning = messageCount >= 45 && messageCount < 50;
  const isBlocked = messageCount >= 50;

  /**
   * Clear all chat history
   */
  const handleClearHistory = async () => {
    setIsClearing(true);

    try {
      await chatHistoryService.clearHistory(conversationId);
      setShowClearModal(false);
      onClearComplete(); // Refresh count
    } catch (error) {
      console.error('[ChatHistory] Failed to clear history:', error);
      // Could show error toast here
    } finally {
      setIsClearing(false);
    }
  };

  /**
   * Export chat history as JSON file
   */
  const handleExportHistory = async () => {
    setIsExporting(true);

    try {
      const messages = await chatHistoryService.exportHistory(conversationId);

      // Create clean JSON without undefined fields
      const exportData = {
        conversationTitle,
        conversationId,
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          ...(m.sources ? { sources: m.sources } : {}),
          ...(m.costUsd !== undefined ? { costUsd: m.costUsd } : {}),
          ...(m.isUnanswerable !== undefined ? { isUnanswerable: m.isUnanswerable } : {})
        }))
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-history-${conversationId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[ChatHistory] Exported history:', { conversationId, count: messages.length });
    } catch (error) {
      console.error('[ChatHistory] Failed to export history:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50/50">
        {/* Message count indicator */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-slate-500">Messages:</span>
          <span
            className={`text-xs font-semibold ${
              isBlocked
                ? 'text-red-600'
                : isWarning
                ? 'text-yellow-600'
                : 'text-slate-700'
            }`}
          >
            {messageCount}/50
          </span>

          {/* Warning/Block indicator */}
          {(isWarning || isBlocked) && (
            <div className="flex items-center gap-1">
              <AlertTriangle
                size={14}
                className={isBlocked ? 'text-red-600' : 'text-yellow-600'}
              />
              <span
                className={`text-xs font-medium ${
                  isBlocked ? 'text-red-600' : 'text-yellow-600'
                }`}
              >
                {isBlocked ? 'Limit reached' : 'Near limit'}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportHistory}
            disabled={messageCount === 0 || isExporting}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export history as JSON"
          >
            <Download size={14} />
          </button>

          <button
            onClick={() => setShowClearModal(true)}
            disabled={messageCount === 0}
            className="p-1.5 rounded hover:bg-red-100 text-slate-600 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear all history"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Clear confirmation modal */}
      {showClearModal && (
        <ClearHistoryModal
          conversationTitle={conversationTitle}
          messageCount={messageCount}
          onConfirm={handleClearHistory}
          onCancel={() => setShowClearModal(false)}
          isClearing={isClearing}
        />
      )}
    </>
  );
};

/**
 * Confirmation modal for clearing chat history
 * Uses similar pattern to DeleteConfirmModal
 */
interface ClearHistoryModalProps {
  conversationTitle: string;
  messageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isClearing: boolean;
}

const ClearHistoryModal: React.FC<ClearHistoryModalProps> = ({
  conversationTitle,
  messageCount,
  onConfirm,
  onCancel,
  isClearing
}) => {
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isClearing) {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel, isClearing]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6 scale-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-history-title"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="text-red-600" size={20} />
            </div>
            <div>
              <h3 id="clear-history-title" className="text-lg font-semibold text-slate-900">
                Clear Chat History?
              </h3>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-sm font-medium text-slate-900 mb-1">Conversation:</p>
            <p className="text-sm text-slate-600 truncate">{conversationTitle}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-sm font-medium text-slate-900 mb-1">Messages to delete:</p>
            <p className="text-sm text-slate-600">{messageCount} messages</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm text-red-800">
                  <span className="font-medium">This action cannot be undone.</span>
                </p>
                <p className="text-sm text-red-700 mt-1">
                  All chat messages will be permanently deleted. Consider exporting your chat
                  history first if you want to keep a record.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isClearing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isClearing}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            {isClearing ? 'Clearing...' : 'Clear History'}
          </Button>
        </div>

        {/* Keyboard hint */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 text-center">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">
              Enter
            </kbd>{' '}
            to clear or{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">
              Esc
            </kbd>{' '}
            to cancel
          </p>
        </div>
      </div>
    </div>
  );
};
