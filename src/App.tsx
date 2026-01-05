import React, { useState, useEffect } from 'react';
import { Library } from '@/pages/Library';
import { Viewer } from '@/pages/Viewer';
import { Search } from '@/pages/Search';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { UserStats } from '@/pages/UserStats';
import { JobDetail } from '@/pages/JobDetail';
import { CostReconciliationReport } from '@/pages/CostReconciliationReport';
import { AuthProvider } from '@/contexts/AuthContext';
import { ConversationProvider, useConversations } from '@/contexts/ConversationContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { useMetric, useReconciliationData } from '@/hooks/useMetrics';
import { ProcessingMetric } from '@/services/metricsService';

/**
 * AppContent - Main app routing logic
 *
 * Handles view switching between Library, Viewer, Search, Admin Dashboard, User Stats, Job Detail, and Cost Reconciliation.
 * Uses window.location for routing without a router library.
 * Admin dashboard and admin reports are gated by AdminRoute component.
 */
function AppContent() {
  const [currentView, setCurrentView] = useState<'library' | 'viewer' | 'search' | 'admin' | 'stats' | 'job-detail' | 'cost-reconciliation'>('library');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [targetSegmentId, setTargetSegmentId] = useState<string | undefined>(undefined);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const { isLoaded, activeConversation, setActiveConversationId } = useConversations();

  // Initialize view from URL on mount and handle browser back/forward
  useEffect(() => {
    const syncFromUrl = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      if (path === '/search') {
        setCurrentView('search');
        setSearchQuery(params.get('q') || '');
      } else if (path === '/admin') {
        setCurrentView('admin');
      } else if (path.startsWith('/admin/jobs/')) {
        const metricId = path.split('/admin/jobs/')[1];
        setSelectedMetricId(metricId);
        setCurrentView('job-detail');
      } else if (path === '/admin/reports/cost-reconciliation') {
        setCurrentView('cost-reconciliation');
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
    window.history.pushState({}, '', '/admin');
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

  const handleJobClick = (metricId: string) => {
    setSelectedMetricId(metricId);
    setCurrentView('job-detail');
    window.history.pushState({}, '', `/admin/jobs/${metricId}`);
  };

  const handleJobDetailBack = () => {
    setCurrentView('admin');
    setSelectedMetricId(null);
    window.history.pushState({}, '', '/admin');
  };

  // Note: handleCostReconciliationClick can be added later when a navigation button is added
  // For now, cost reconciliation is accessible via direct URL

  const handleCostReconciliationBack = () => {
    setCurrentView('admin');
    window.history.pushState({}, '', '/admin');
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
        <AdminDashboard onBack={handleAdminBack} onJobClick={handleJobClick} />
      </AdminRoute>
    );
  }

  if (currentView === 'job-detail') {
    return <JobDetailWrapper metricId={selectedMetricId} onBack={handleJobDetailBack} />;
  }

  if (currentView === 'cost-reconciliation') {
    return <CostReconciliationWrapper onBack={handleCostReconciliationBack} />;
  }

  if (currentView === 'stats') {
    return <UserStats onBack={handleStatsBack} onAdminClick={handleAdminClick} />;
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
 * JobDetailWrapper - Loads metric data for JobDetail page
 */
function JobDetailWrapper({ metricId, onBack }: { metricId: string | null; onBack: () => void }) {
  const { data: metric, loading, error } = useMetric(metricId);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400">
        Loading job details...
      </div>
    );
  }

  if (error || !metric) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-red-600 mb-4">Failed to load job details</div>
        <button onClick={onBack} className="text-blue-600 hover:underline">
          Back to Admin Dashboard
        </button>
      </div>
    );
  }

  // Only ProcessingMetric is supported in JobDetail for now
  if ('type' in metric && metric.type === 'chat') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-slate-600 mb-4">Chat metrics detail view not yet implemented</div>
        <button onClick={onBack} className="text-blue-600 hover:underline">
          Back to Admin Dashboard
        </button>
      </div>
    );
  }

  return (
    <AdminRoute fallback={<div>Admin access required</div>}>
      <JobDetail metric={metric as ProcessingMetric} onBack={onBack} />
    </AdminRoute>
  );
}

/**
 * CostReconciliationWrapper - Loads reconciliation data for report
 */
function CostReconciliationWrapper({ onBack }: { onBack: () => void }) {
  const { metrics, pricingConfigs, loading, error } = useReconciliationData({ days: 30 });

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400">
        Loading reconciliation data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-red-600 mb-4">Failed to load reconciliation data</div>
        <button onClick={onBack} className="text-blue-600 hover:underline">
          Back to Admin Dashboard
        </button>
      </div>
    );
  }

  return (
    <AdminRoute fallback={<div>Admin access required</div>}>
      <CostReconciliationReport metrics={metrics} pricingConfigs={pricingConfigs} onBack={onBack} />
    </AdminRoute>
  );
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
