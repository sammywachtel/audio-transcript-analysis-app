import React, { useState, useEffect } from 'react';
import { Library } from './pages/Library';
import { Viewer } from './pages/Viewer';
import { Search } from './pages/Search';
import { AdminDashboard } from './pages/AdminDashboard';
import { UserStats } from './pages/UserStats';
import { AuthProvider } from './contexts/AuthContext';
import { ConversationProvider, useConversations } from './contexts/ConversationContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';

/**
 * AppContent - Main app routing logic
 *
 * Handles view switching between Library, Viewer, Search, Admin Dashboard, and User Stats.
 * Uses window.location for routing without a router library.
 * Admin dashboard is gated by AdminRoute component.
 */
function AppContent() {
  const [currentView, setCurrentView] = useState<'library' | 'viewer' | 'search' | 'admin' | 'stats'>('library');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [targetSegmentId, setTargetSegmentId] = useState<string | undefined>(undefined);
  const { isLoaded, activeConversation, setActiveConversationId } = useConversations();

  // Initialize view from URL on mount and handle browser back/forward
  useEffect(() => {
    const syncFromUrl = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      if (path === '/search') {
        setCurrentView('search');
        setSearchQuery(params.get('q') || '');
      } else {
        // Default to library for root or unknown paths
        setCurrentView('library');
      }
    };

    // Sync on mount
    syncFromUrl();

    // Handle browser back/forward
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const handleOpen = (id: string, targetSegment?: string) => {
    setActiveConversationId(id);
    setTargetSegmentId(targetSegment);
    setCurrentView('viewer');
    // Clear URL params when opening viewer (viewer doesn't use URL state)
    window.history.pushState({}, '', '/');
  };

  const handleBack = () => {
    setCurrentView('library');
    setActiveConversationId(null);
    setTargetSegmentId(undefined);
    window.history.pushState({}, '', '/');
  };

  const handleSearchClick = () => {
    setCurrentView('search');
    const url = searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : '/search';
    window.history.pushState({}, '', url);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    // Update URL with new query
    const url = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    window.history.replaceState({}, '', url);
  };

  const handleAdminClick = () => {
    setCurrentView('admin');
  };

  const handleAdminBack = () => {
    setCurrentView('library');
    window.history.pushState({}, '', '/');
  };

  const handleStatsClick = () => {
    setCurrentView('stats');
  };

  const handleStatsBack = () => {
    setCurrentView('library');
    window.history.pushState({}, '', '/');
  };

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400">
        Loading...
      </div>
    );
  }

  if (currentView === 'admin') {
    return (
      <AdminRoute fallback={<Library onOpen={handleOpen} onAdminClick={handleAdminClick} onStatsClick={handleStatsClick} onSearchClick={handleSearchClick} />}>
        <AdminDashboard onBack={handleAdminBack} />
      </AdminRoute>
    );
  }

  if (currentView === 'stats') {
    return <UserStats onBack={handleStatsBack} />;
  }

  if (currentView === 'search') {
    return (
      <Search
        onBack={handleBack}
        onOpenConversation={handleOpen}
        initialQuery={searchQuery}
        onQueryChange={handleSearchQueryChange}
      />
    );
  }

  if (currentView === 'viewer' && activeConversation) {
    return (
      <Viewer
        onBack={handleBack}
        onStatsClick={handleStatsClick}
        targetSegmentId={targetSegmentId}
      />
    );
  }

  return <Library onOpen={handleOpen} onAdminClick={handleAdminClick} onStatsClick={handleStatsClick} onSearchClick={handleSearchClick} />;
}

/**
 * App - Root component with nested Context Providers
 *
 * Provider hierarchy (outer to inner):
 * 1. AuthProvider - Manages user authentication state
 * 2. ConversationProvider - Manages conversation state (depends on auth)
 * 3. ProtectedRoute - Gates access to app content (requires auth)
 * 4. AppContent - Main app UI
 *
 * This structure ensures:
 * - Auth state is available to ConversationProvider
 * - Conversations are filtered by authenticated user
 * - Users must sign in before accessing the app
 */
function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <ProtectedRoute>
          <AppContent />
        </ProtectedRoute>
      </ConversationProvider>
    </AuthProvider>
  );
}

export default App;
