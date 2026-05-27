'use client';

import { ActivityDataPoint } from '@/hooks/useAnalytics';
import { format, startOfWeek, addDays } from 'date-fns';

interface StudyHeatmapProps {
  data: ActivityDataPoint[];
}

export default function StudyHeatmap({ data }: StudyHeatmapProps) {
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
        <span className="h-3 w-3 rounded-sm bg-red-600"></span>
        Study Activity Heatmap
      </h3>
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
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="text-text-secondary mt-4 flex items-center gap-2 text-xs">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded-sm bg-zinc-900"></div>
            <div className="h-3 w-3 rounded-sm bg-red-900/30"></div>
            <div className="h-3 w-3 rounded-sm bg-red-700/50"></div>
            <div className="h-3 w-3 rounded-sm bg-red-600/70"></div>
            <div className="h-3 w-3 rounded-sm bg-red-500"></div>
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
