/**
 * PricingAccuracyIndicator - Shows pricing accuracy status on user stats page
 *
 * Displays a badge showing how closely stored cost snapshots match current pricing.
 * Shows:
 * - ✓ (green) for match (<1% variance)
 * - ⚠️ (yellow) for minor variance (1-5%)
 * - ❌ (red) for significant variance (>5%)
 * - Timestamp when rates were captured
 * - Disclaimer about configured vs actual billing
 * - Admin link to detailed cost breakdown (if admin)
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/utils';
import {
  ProcessingMetric,
  getPricingAccuracyStatus,
  PricingAccuracyInfo
} from '@/services/metricsService';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ExternalLink } from 'lucide-react';

interface PricingAccuracyIndicatorProps {
  metrics: ProcessingMetric[];
  isAdmin: boolean;
  onAdminClick?: () => void;
  className?: string;
}

export const PricingAccuracyIndicator: React.FC<PricingAccuracyIndicatorProps> = ({
  metrics,
  isAdmin,
  onAdminClick,
  className
}) => {
  const [loading, setLoading] = useState(true);
  const [accuracyInfo, setAccuracyInfo] = useState<PricingAccuracyInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAccuracy = async () => {
      setLoading(true);
      try {
        const info = await getPricingAccuracyStatus(metrics);
        if (!cancelled) {
          setAccuracyInfo(info);
          setLoading(false);
        }
      } catch (error) {
        console.error('[PricingAccuracyIndicator] Failed to fetch accuracy:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (metrics.length > 0) {
      fetchAccuracy();
    } else {
      setLoading(false);
      setAccuracyInfo({
        status: 'match',
        capturedAt: null,
        label: 'No pricing data available',
        hasSnapshot: false
      });
    }

    return () => {
      cancelled = true;
    };
  }, [metrics]);

  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl border border-slate-200 p-6', className)}>
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Checking pricing accuracy...</span>
        </div>
      </div>
    );
  }

  if (!accuracyInfo) {
    return null;
  }

  // Determine badge config based on status
  const getBadgeConfig = () => {
    switch (accuracyInfo.status) {
      case 'match':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200'
        };
      case 'minor':
        return {
          icon: AlertTriangle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200'
        };
      case 'significant':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200'
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  // Format timestamp
  const formatTimestamp = (date: Date | null) => {
    if (!date) return '--';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-6', className)}>
      <h3 className="text-sm font-medium text-slate-500 mb-4">Pricing Accuracy</h3>

      {/* Status badge */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn(
          'inline-flex items-center px-3 py-1.5 rounded-lg border',
          config.color,
          config.bg,
          config.border
        )}>
          <Icon size={16} className="mr-2" />
          <span className="text-sm font-medium">{accuracyInfo.label}</span>
        </div>
      </div>

      {/* Timestamp */}
      {accuracyInfo.hasSnapshot && accuracyInfo.capturedAt && (
        <div className="mb-4 text-sm">
          <span className="text-slate-500">Rates as of: </span>
          <span className="font-medium text-slate-900">
            {formatTimestamp(accuracyInfo.capturedAt)}
          </span>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mb-4">
        <p className="text-xs text-slate-600">
          Cost estimates use configured rates. Actual billing may vary based on your cloud provider's pricing.
        </p>
      </div>

      {/* Admin link */}
      {isAdmin && onAdminClick && (
        <button
          onClick={onAdminClick}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium',
            'text-blue-600 hover:text-blue-700 transition-colors'
          )}
        >
          View cost breakdown
          <ExternalLink size={14} />
        </button>
      )}
    </div>
  );
};
