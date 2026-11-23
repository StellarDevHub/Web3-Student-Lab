'use client';

import { useState } from 'react';
import { ActivityDataPoint } from '@/hooks/useAnalytics';
import { format, startOfWeek, addDays } from 'date-fns';
import { ChartDataTable, type ColumnDef } from './ChartDataTable';

interface StudyHeatmapProps {
  data: ActivityDataPoint[];
}

const CHART_SUMMARY = 'Calendar heatmap of daily study activity over the past 13 weeks, where darker cells indicate more activity.';

const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'date', label: 'Date' },
  { key: 'count', label: 'Activities' },
];

export default function StudyHeatmap({ data }: StudyHeatmapProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = 'study-heatmap-table';
  const weeks = 13;
  const startDate = startOfWeek(new Date());

  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) return 'bg-zinc-900';
    if (intensity < 0.25) return 'bg-red-900/30';
    if (intensity < 0.5) return 'bg-red-700/50';
    if (intensity < 0.75) return 'bg-red-600/70';
    return 'bg-red-500';
  };

  const getDayData = (weekIndex: number, dayIndex: number) => {
    const date = addDays(startDate, -(weeks - weekIndex) * 7 + dayIndex);
    const dateStr = format(date, 'yyyy-MM-dd');
    return data.find((d) => d.date === dateStr) || { date: dateStr, count: 0, intensity: 0 };
  };

  return (
    <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
      <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
        <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
        Study Activity Heatmap
      </h3>
      <div role="img" aria-label={CHART_SUMMARY}>
        <div className="overflow-x-auto">
          <div className="inline-flex gap-1">
            {Array.from({ length: weeks }).map((_, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const dayData = getDayData(weekIndex, dayIndex);
                  return (
                    <div
                      key={dayIndex}
                      className={`h-3 w-3 rounded-sm ${getIntensityColor(dayData.intensity)} cursor-pointer transition-all hover:ring-2 hover:ring-red-500`}
                      title={`${dayData.date}: ${dayData.count} activities`}
                      role="gridcell"
                      aria-label={`${dayData.date}: ${dayData.count} study activities`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="text-text-secondary mt-4 flex items-center gap-2 text-xs">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded-sm bg-zinc-900" />
              <div className="h-3 w-3 rounded-sm bg-red-900/30" />
              <div className="h-3 w-3 rounded-sm bg-red-700/50" />
              <div className="h-3 w-3 rounded-sm bg-red-600/70" />
              <div className="h-3 w-3 rounded-sm bg-red-500" />
            </div>
            <span>More</span>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <button
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="text-xs font-bold tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
      </div>
      {showTable && (
        <div className="mt-3">
          <ChartDataTable
            columns={TABLE_COLUMNS}
            data={data.slice(0, 91)}
            caption="Daily study activity count for the past 13 weeks."
            id={tableId}
          />
        </div>
      )}
    </div>
  );
}
