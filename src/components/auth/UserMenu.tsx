import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, User as UserIcon, BarChart3 } from 'lucide-react';

interface UserMenuProps {
  onStatsClick?: () => void;
}

/**
 * UserMenu - Dropdown menu for authenticated users
 *
 * Shows user profile info (photo, name, email), My Stats link, and sign-out option.
 * Clicking outside the dropdown closes it automatically.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ onStatsClick }) => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsOpen(false);
    } catch (e) {
      console.error('Sign-out error:', e);
      // Error is already handled by AuthContext
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          hover:bg-slate-100 active:bg-slate-200
          transition-colors duration-200
          ${isOpen ? 'bg-slate-100' : ''}
        `}
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {/* Profile picture or fallback icon */}
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || user.email || 'User'}
            className="w-8 h-8 rounded-full border border-slate-300"
            referrerPolicy="no-referrer" // Prevents issues with Google profile pics
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-slate-600" />
          </div>
        )}

        {/* User name (hidden on mobile) */}
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[150px] truncate">
          {user.displayName || user.email?.split('@')[0] || 'User'}
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={`
            absolute right-0 mt-2 w-64
            bg-white rounded-lg shadow-lg border border-slate-200
            py-2 z-50
            animate-in fade-in slide-in-from-top-2 duration-200
          `}
        >
          {/* User info section */}
          <div className="px-4 py-3 border-b border-slate-200">
            <p className="text-sm font-medium text-slate-900 truncate">
              {user.displayName || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {user.email}
            </p>
          </div>

          {/* Actions */}
          <div className="py-1">
            {onStatsClick && (
              <button
                onClick={() => {
                  onStatsClick();
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-2
                  text-sm text-slate-700
                  hover:bg-slate-50 active:bg-slate-100
                  transition-colors duration-150
                `}
              >
                <BarChart3 className="w-4 h-4" />
                <span>My Stats</span>
              </button>
            )}
            <button
              onClick={handleSignOut}
              className={`
                w-full flex items-center gap-3 px-4 py-2
                text-sm text-slate-700
                hover:bg-slate-50 active:bg-slate-100
                transition-colors duration-150
              `}
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
