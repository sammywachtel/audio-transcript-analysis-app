import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '../Button';

interface AbortConfirmModalProps {
  conversationTitle: string;
  currentProgress?: number; // 0-100
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * AbortConfirmModal - Branded confirmation for aborting processing
 *
 * Shows conversation context and warns about partial costs.
 * Follows RenameSpeakerModal pattern for consistency.
 */
export const AbortConfirmModal: React.FC<AbortConfirmModalProps> = ({
  conversationTitle,
  currentProgress = 0,
  onConfirm,
  onCancel
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

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
        aria-labelledby="abort-title"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="text-amber-600" size={20} />
            </div>
            <div>
              <h3 id="abort-title" className="text-lg font-semibold text-slate-900">
                Cancel Processing?
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

          {currentProgress > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-sm font-medium text-slate-900 mb-2">Current Progress:</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-700">{currentProgress}%</span>
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              <span className="font-medium">Warning:</span> Any work completed so far may still
              contribute to usage costs. View your stats page for cost details. The conversation
              will be marked as cancelled and removed from your library.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Keep Processing
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
          >
            Cancel Job
          </Button>
        </div>
      </div>
    </div>
  );
};
