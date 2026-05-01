"use client";

import { ActivityDataPoint } from "@/hooks/useAnalytics";
import { format, startOfWeek, addDays } from "date-fns";

interface StudyHeatmapProps {
  data: ActivityDataPoint[];
}

export default function StudyHeatmap({ data }: StudyHeatmapProps) {
  const weeks = 13;
  const startDate = startOfWeek(new Date());
  
  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) return "bg-zinc-900";
    if (intensity < 0.25) return "bg-red-900/30";
    if (intensity < 0.5) return "bg-red-700/50";
    if (intensity < 0.75) return "bg-red-600/70";
    return "bg-red-500";
  };

  const getDayData = (weekIndex: number, dayIndex: number) => {
    const date = addDays(startDate, -(weeks - weekIndex) * 7 + dayIndex);
    const dateStr = format(date, "yyyy-MM-dd");
    return data.find((d) => d.date === dateStr) || { date: dateStr, count: 0, intensity: 0 };
  };

  return (
    <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
      <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
        <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
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
                    className={`w-3 h-3 rounded-sm ${getIntensityColor(dayData.intensity)} hover:ring-2 hover:ring-red-500 transition-all cursor-pointer`}
                    title={`${dayData.date}: ${dayData.count} activities`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-text-secondary">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-zinc-900 rounded-sm"></div>
            <div className="w-3 h-3 bg-red-900/30 rounded-sm"></div>
            <div className="w-3 h-3 bg-red-700/50 rounded-sm"></div>
            <div className="w-3 h-3 bg-red-600/70 rounded-sm"></div>
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
