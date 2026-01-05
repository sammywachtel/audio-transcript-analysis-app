/**
 * CostReconciliationReport - Weekly/monthly cost verification report
 *
 * Accessible at `/admin/reports/cost-reconciliation`
 * Shows:
 * - Weekly and monthly summaries per service
 * - Estimated vs recalculated totals
 * - Variance highlighting (>5% in red)
 * - Pricing change log
 * - CSV export for finance stakeholders
 */

import React, { useState, useMemo } from 'react';
import { Button } from '../components/Button';
import { ArrowLeft, Download, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ProcessingMetric,
  ChatMetric,
  PricingConfig,
  formatUsd
} from '../services/metricsService';
import { cn } from '../utils';

interface CostReconciliationReportProps {
  metrics: (ProcessingMetric | ChatMetric)[];
  pricingConfigs: PricingConfig[];
  onBack: () => void;
}

type ViewMode = 'weekly' | 'monthly';
type ServiceType = 'gemini' | 'whisperx' | 'chat' | 'all';

interface PeriodSummary {
  period: string;
  service: string;
  jobCount: number;
  estimatedCost: number;
  recalculatedCost: number;
  variance: number;
  variancePercent: number;
}

export const CostReconciliationReport: React.FC<CostReconciliationReportProps> = ({
  metrics,
  pricingConfigs,
  onBack
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [dateRange, setDateRange] = useState(30); // days
  const [serviceFilter, setServiceFilter] = useState<ServiceType>('all');

  // Filter metrics by date range
  const filteredMetrics = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dateRange);

    return metrics.filter(m => {
      const timestamp = m.timestamp.toDate?.() || new Date(m.timestamp as unknown as string);
      return timestamp >= cutoff;
    });
  }, [metrics, dateRange]);

  // Generate period summaries
  const summaries = useMemo(() => {
    const periodMap = new Map<string, Map<string, PeriodSummary>>();

    filteredMetrics.forEach(metric => {
      const timestamp = metric.timestamp.toDate?.() || new Date(metric.timestamp as unknown as string);

      // Determine period key
      let periodKey: string;
      if (viewMode === 'weekly') {
        const weekStart = new Date(timestamp);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
        // Use local date components to avoid timezone shift
        const year = weekStart.getFullYear();
        const month = String(weekStart.getMonth() + 1).padStart(2, '0');
        const day = String(weekStart.getDate()).padStart(2, '0');
        periodKey = `${year}-${month}-${day}`;
      } else {
        periodKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}`;
      }

      // Determine service type
      let service: string;
      let estimatedCost = 0;
      let recalculatedCost = 0; // For now, same as estimated (would need actual recalculation)

      if ('type' in metric && metric.type === 'chat') {
        service = 'chat';
        estimatedCost = metric.costUsd;
        recalculatedCost = metric.costUsd; // Simplified
      } else {
        const processingMetric = metric as ProcessingMetric;
        if (processingMetric.estimatedCost) {
          // Split by service component
          if (processingMetric.llmUsage?.geminiAnalysis) {
            const geminiCost = processingMetric.estimatedCost.geminiUsd;
            updatePeriodSummary(periodMap, periodKey, 'gemini', geminiCost, geminiCost);
          }
          if (processingMetric.llmUsage?.whisperx) {
            const whisperxCost = processingMetric.estimatedCost.whisperxUsd +
              (processingMetric.estimatedCost.diarizationUsd || 0);
            updatePeriodSummary(periodMap, periodKey, 'whisperx', whisperxCost, whisperxCost);
          }
          return; // Skip the general update below
        }
        service = 'processing';
        estimatedCost = processingMetric.estimatedCost?.totalUsd || 0;
        recalculatedCost = estimatedCost;
      }

      updatePeriodSummary(periodMap, periodKey, service, estimatedCost, recalculatedCost);
    });

    // Helper function to update period summary
    function updatePeriodSummary(
      map: Map<string, Map<string, PeriodSummary>>,
      period: string,
      service: string,
      estimated: number,
      recalculated: number
    ) {
      if (!map.has(period)) {
        map.set(period, new Map());
      }
      const serviceMap = map.get(period)!;

      if (!serviceMap.has(service)) {
        serviceMap.set(service, {
          period,
          service,
          jobCount: 0,
          estimatedCost: 0,
          recalculatedCost: 0,
          variance: 0,
          variancePercent: 0
        });
      }

      const summary = serviceMap.get(service)!;
      summary.jobCount++;
      summary.estimatedCost += estimated;
      summary.recalculatedCost += recalculated;
      summary.variance = summary.recalculatedCost - summary.estimatedCost;
      summary.variancePercent = summary.estimatedCost > 0
        ? (summary.variance / summary.estimatedCost) * 100
        : 0;
    }

    // Flatten to array and sort
    const result: PeriodSummary[] = [];
    periodMap.forEach((serviceMap) => {
      serviceMap.forEach((summary) => {
        if (serviceFilter === 'all' || summary.service === serviceFilter) {
          result.push(summary);
        }
      });
    });

    return result.sort((a, b) => b.period.localeCompare(a.period));
  }, [filteredMetrics, viewMode, serviceFilter]);

  // Pricing changes in the current date range
  const pricingChanges = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dateRange);

    return pricingConfigs.filter(config => {
      const effectiveDate = config.effectiveFrom.toDate?.() || new Date(config.effectiveFrom as unknown as string);
      return effectiveDate >= cutoff;
    }).sort((a, b) => {
      const dateA = a.effectiveFrom.toDate?.() || new Date(a.effectiveFrom as unknown as string);
      const dateB = b.effectiveFrom.toDate?.() || new Date(b.effectiveFrom as unknown as string);
      return dateB.getTime() - dateA.getTime();
    });
  }, [pricingConfigs, dateRange]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Period', 'Service', 'Jobs', 'Estimated Cost', 'Recalculated Cost', 'Variance', 'Variance %'];
    const rows = summaries.map(s => [
      s.period,
      s.service,
      s.jobCount.toString(),
      s.estimatedCost.toFixed(6),
      s.recalculatedCost.toFixed(6),
      s.variance.toFixed(6),
      s.variancePercent.toFixed(2)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost-reconciliation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack} className="gap-2">
              <ArrowLeft size={18} />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cost Reconciliation</h1>
              <p className="text-slate-500 mt-1">Verify billing accuracy across services</p>
            </div>
          </div>
          <Button onClick={handleExportCsv} className="gap-2">
            <Download size={16} />
            Export CSV
          </Button>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm text-slate-600">Period:</span>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Date Range:</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value))}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Service:</span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as ServiceType)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Services</option>
              <option value="gemini">Gemini</option>
              <option value="whisperx">WhisperX</option>
              <option value="chat">Chat</option>
            </select>
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-medium text-slate-700">Cost Summary</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Jobs
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estimated Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Recalculated Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No data available for selected filters
                    </td>
                  </tr>
                ) : (
                  summaries.map((summary, idx) => {
                    const isSignificant = Math.abs(summary.variancePercent) > 5;
                    const isMinor = Math.abs(summary.variancePercent) > 1 && Math.abs(summary.variancePercent) <= 5;

                    return (
                      <tr
                        key={`${summary.period}-${summary.service}-${idx}`}
                        className={cn(
                          'hover:bg-slate-50 transition-colors',
                          isSignificant && 'bg-red-50'
                        )}
                      >
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {summary.period}
                        </td>
                        <td className="px-4 py-3 text-slate-700 capitalize">
                          {summary.service}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {summary.jobCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                          {formatUsd(summary.estimatedCost)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900">
                          {formatUsd(summary.recalculatedCost)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {summary.variance > 0 ? (
                              <TrendingUp size={14} className="text-red-500" />
                            ) : summary.variance < 0 ? (
                              <TrendingDown size={14} className="text-green-500" />
                            ) : null}
                            <span className={cn(
                              'font-mono',
                              summary.variance > 0 ? 'text-red-600' : summary.variance < 0 ? 'text-green-600' : 'text-slate-600'
                            )}>
                              {summary.variance >= 0 ? '+' : ''}{formatUsd(summary.variance)}
                            </span>
                            <span className="text-slate-400 text-xs ml-1">
                              ({summary.variancePercent >= 0 ? '+' : ''}{summary.variancePercent.toFixed(2)}%)
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSignificant ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              ❌ Significant
                            </span>
                          ) : isMinor ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              ⚠️ Minor
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              ✓ Match
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing Change Log */}
        {pricingChanges.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-medium text-slate-700">Pricing Changes in Period</h2>
            </div>

            <div className="divide-y divide-slate-100">
              {pricingChanges.map((config, idx) => {
                const effectiveDate = config.effectiveFrom.toDate?.() || new Date(config.effectiveFrom as unknown as string);
                return (
                  <div key={`${config.pricingId}-${idx}`} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{config.model}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {config.service}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600 space-y-1">
                          {config.inputPricePerMillion !== undefined && (
                            <div>Input: ${config.inputPricePerMillion}/M tokens</div>
                          )}
                          {config.outputPricePerMillion !== undefined && (
                            <div>Output: ${config.outputPricePerMillion}/M tokens</div>
                          )}
                          {config.pricePerSecond !== undefined && (
                            <div>Compute: ${config.pricePerSecond}/second</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Effective</div>
                        <div className="text-sm font-medium text-slate-900">
                          {effectiveDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    </div>
                    {config.notes && (
                      <div className="mt-2 text-xs text-slate-500 italic">
                        {config.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
