/**
 * ChatInput Component
 *
 * Text input for chat messages with submit button.
 * Handles Enter key submission (Shift+Enter for newlines).
 */

import React, { useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../../utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Ask a question about this transcript...'
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle Enter key:
   * - Enter alone = submit
   * - Shift+Enter = newline
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  /**
   * Auto-resize textarea based on content
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);

    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="p-3 border-t border-slate-200 bg-white">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'flex-1 resize-none text-sm rounded-lg border bg-white px-3 py-2',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'placeholder:text-slate-400 text-slate-900',
            'max-h-32 overflow-y-auto',
            disabled
              ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
              : 'border-slate-300 hover:border-slate-400'
          )}
          style={{ minHeight: '38px' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            'shrink-0 p-2 rounded-lg transition-all',
            disabled || !value.trim()
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
          )}
          title="Send message (Enter)"
        >
          <Send size={18} />
        </button>
      </div>
      <div className="mt-1.5 text-[10px] text-slate-400 px-1">
        Press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Enter</kbd> to send,{' '}
        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Shift+Enter</kbd> for new line
      </div>
    </div>
  );
};
