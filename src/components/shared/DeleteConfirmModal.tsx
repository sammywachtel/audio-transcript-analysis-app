import React, { useEffect } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../Button';

interface DeleteConfirmModalProps {
  conversationTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * DeleteConfirmModal - Branded confirmation for deleting conversations
 *
 * Shows conversation context and permanent deletion warning.
 * Supports keyboard shortcuts: Enter to confirm, Escape to cancel.
 */
export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  conversationTitle,
  onConfirm,
  onCancel
}) => {
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);

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
        aria-labelledby="delete-title"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="text-red-600" size={20} />
            </div>
            <div>
              <h3 id="delete-title" className="text-lg font-semibold text-slate-900">
                Delete Conversation?
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

          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm text-red-800">
                  <span className="font-medium">This action cannot be undone.</span>
                </p>
                <p className="text-sm text-red-700 mt-1">
                  The conversation and all associated data will be permanently deleted from your
                  library and cloud storage.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            Delete
          </Button>
        </div>

        {/* Keyboard hint */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">Enter</kbd> to delete or{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">Esc</kbd> to cancel
          </p>
        </div>
      </div>
    </div>
  );
};
