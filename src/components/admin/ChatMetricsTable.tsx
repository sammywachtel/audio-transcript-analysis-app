/**
 * ChatMetricsTable - Displays aggregated chat metrics by conversation
 *
 * Groups chat queries by conversationId and shows:
 * - Query count
 * - Total tokens (input/output)
 * - Average response time
 * - Total cost
 *
 * Includes pricing migration warning banner when chat pricing is incomplete.
 */

import React, { useMemo } from 'react';
import { cn } from '@/utils';
import { ChatMetric, formatDuration, formatUsd } from '@/services/metricsService';
import { AlertTriangle, MessageSquare, Clock, DollarSign, Zap } from 'lucide-react';

interface ChatMetricsTableProps {
  metrics: ChatMetric[];
  showPricingWarning?: boolean;
  className?: string;
}

interface ConversationAggregate {
  conversationId: string;
  queryCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgResponseTime: number;
  lastQuery: Date;
  hasPricingSnapshot: boolean;
}

export const ChatMetricsTable: React.FC<ChatMetricsTableProps> = ({
  metrics,
  showPricingWarning = true,
  className
}) => {
  // Aggregate metrics by conversation
  const aggregates = useMemo(() => {
    const byConversation = new Map<string, ConversationAggregate>();

    metrics.forEach(metric => {
      const existing = byConversation.get(metric.conversationId);
      const timestamp = metric.timestamp.toDate?.() || new Date(metric.timestamp as unknown as string);

      if (existing) {
        existing.queryCount++;
        existing.totalInputTokens += metric.tokenUsage.inputTokens;
        existing.totalOutputTokens += metric.tokenUsage.outputTokens;
        existing.totalCost += metric.costUsd;
        existing.avgResponseTime = (existing.avgResponseTime * (existing.queryCount - 1) + metric.responseTimeMs) / existing.queryCount;
        if (timestamp > existing.lastQuery) {
          existing.lastQuery = timestamp;
        }
        if (metric.pricingSnapshot) {
          existing.hasPricingSnapshot = true;
        }
      } else {
        byConversation.set(metric.conversationId, {
          conversationId: metric.conversationId,
          queryCount: 1,
          totalInputTokens: metric.tokenUsage.inputTokens,
          totalOutputTokens: metric.tokenUsage.outputTokens,
          totalCost: metric.costUsd,
          avgResponseTime: metric.responseTimeMs,
          lastQuery: timestamp,
          hasPricingSnapshot: !!metric.pricingSnapshot
        });
      }
    });

    // Sort by last query descending
    return Array.from(byConversation.values()).sort((a, b) =>
      b.lastQuery.getTime() - a.lastQuery.getTime()
    );
  }, [metrics]);

  // Check if any metrics are missing pricing snapshots
  const hasMissingPricing = aggregates.some(agg => !agg.hasPricingSnapshot);

  if (metrics.length === 0) {
    return (
      <div className={cn('bg-white rounded-lg border border-slate-200 p-8 text-center', className)}>
        <MessageSquare size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-slate-500">No chat queries recorded yet</p>
        <p className="text-sm text-slate-400 mt-1">
          Chat metrics will appear here once users start asking questions
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Pricing migration warning */}
      {showPricingWarning && hasMissingPricing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-900 mb-1">
              Pricing Migration In Progress
            </h4>
            <p className="text-sm text-amber-700">
              Some chat queries are using estimated pricing. Billing reconciliation will be
              available once all queries have pricing snapshots captured.
            </p>
          </div>
        </div>
      )}

      {/* Aggregated metrics table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-medium text-slate-700">
            Chat Activity by Conversation
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Conversation
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Queries
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Tokens
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Avg Response
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Last Query
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aggregates.map((agg) => {
                const totalTokens = agg.totalInputTokens + agg.totalOutputTokens;
                const tokensFormatted = totalTokens >= 1_000_000
                  ? `${(totalTokens / 1_000_000).toFixed(2)}M`
                  : totalTokens >= 1_000
                    ? `${(totalTokens / 1_000).toFixed(1)}K`
                    : totalTokens.toString();

                return (
                  <tr
                    key={agg.conversationId}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-slate-400" />
                        <span className="font-mono text-xs text-slate-600">
                          {agg.conversationId.slice(0, 12)}...
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Zap size={12} className="text-blue-500" />
                        <span className="font-medium text-slate-900">
                          {agg.queryCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-slate-600">
                        <div className="font-medium">{tokensFormatted}</div>
                        <div className="text-xs text-slate-400">
                          {(agg.totalInputTokens / 1_000).toFixed(0)}K in / {(agg.totalOutputTokens / 1_000).toFixed(0)}K out
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Clock size={12} className="text-slate-400" />
                        <span className="text-slate-600">
                          {formatDuration(agg.avgResponseTime)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <DollarSign size={12} className="text-amber-500" />
                        <span className="font-medium text-slate-900">
                          {formatUsd(agg.totalCost)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 text-xs">
                      {agg.lastQuery.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Summary footer */}
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr className="font-medium">
                <td className="px-4 py-3 text-slate-700">
                  Total ({aggregates.length} conversations)
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {aggregates.reduce((sum, agg) => sum + agg.queryCount, 0)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {(() => {
                    const total = aggregates.reduce((sum, agg) =>
                      sum + agg.totalInputTokens + agg.totalOutputTokens, 0
                    );
                    return total >= 1_000_000
                      ? `${(total / 1_000_000).toFixed(2)}M`
                      : `${(total / 1_000).toFixed(1)}K`;
                  })()}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatDuration(
                    aggregates.reduce((sum, agg) => sum + agg.avgResponseTime, 0) / aggregates.length
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatUsd(aggregates.reduce((sum, agg) => sum + agg.totalCost, 0))}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
