import React from 'react';
import { SearchFilters } from '../../hooks/useSearchFilters';

interface DateRangeFilterProps {
  dateRange: SearchFilters['dateRange'];
  customStart?: Date;
  customEnd?: Date;
  onDateRangeChange: (range: SearchFilters['dateRange']) => void;
  onCustomDateChange: (start: Date | undefined, end: Date | undefined) => void;
}

/**
 * DateRangeFilter - Date range filter with preset and custom options
 *
 * Provides:
 * - Radio buttons for All Time, Last 7/30/90 Days
 * - Custom range with date inputs
 * - Clean, accessible form controls
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateRange,
  customStart,
  customEnd,
  onDateRangeChange,
  onCustomDateChange
}) => {
  const handleCustomStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value ? new Date(e.target.value) : undefined;
    onCustomDateChange(newStart, customEnd);
  };

  const handleCustomEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value ? new Date(e.target.value) : undefined;
    onCustomDateChange(customStart, newEnd);
  };

  return (
    <div className="space-y-3">
      {/* Preset ranges */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="dateRange"
          value="all"
          checked={dateRange === 'all'}
          onChange={(e) => onDateRangeChange(e.target.value as SearchFilters['dateRange'])}
          className="text-blue-500 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">All Time</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="dateRange"
          value="7d"
          checked={dateRange === '7d'}
          onChange={(e) => onDateRangeChange(e.target.value as SearchFilters['dateRange'])}
          className="text-blue-500 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Last 7 Days</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="dateRange"
          value="30d"
          checked={dateRange === '30d'}
          onChange={(e) => onDateRangeChange(e.target.value as SearchFilters['dateRange'])}
          className="text-blue-500 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Last 30 Days</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="dateRange"
          value="90d"
          checked={dateRange === '90d'}
          onChange={(e) => onDateRangeChange(e.target.value as SearchFilters['dateRange'])}
          className="text-blue-500 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Last 90 Days</span>
      </label>

      {/* Custom range */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="radio"
            name="dateRange"
            value="custom"
            checked={dateRange === 'custom'}
            onChange={(e) => onDateRangeChange(e.target.value as SearchFilters['dateRange'])}
            className="text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Custom Range</span>
        </label>

        {dateRange === 'custom' && (
          <div className="ml-6 space-y-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={customStart ? customStart.toISOString().split('T')[0] : ''}
                onChange={handleCustomStartChange}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={customEnd ? customEnd.toISOString().split('T')[0] : ''}
                onChange={handleCustomEndChange}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
