'use client';

import { useState } from 'react';
import ProgressChart from './ProgressChart';
import SkillRadar from './SkillRadar';
import CompletionPie from './CompletionPie';
import StudyHeatmap from './StudyHeatmap';
import TrendChart from './TrendChart';
import TimeDistributionChart from './TimeDistributionChart';
import { DataProcessor } from '@/lib/analytics/DataProcessor';
import { FileDown, Calendar } from 'lucide-react';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('30');

  const progressData = DataProcessor.generateMockProgressData(parseInt(dateRange));
  const skillData = DataProcessor.generateMockSkillData();
  const completionData = DataProcessor.generateMockCompletionData();
  const activityData = DataProcessor.generateMockActivityData(90);
  const trendData = DataProcessor.generateMockTrendData();
  const timeData = DataProcessor.generateMockTimeData();

  const handleExportCSV = (dataType: string) => {
    switch (dataType) {
      case 'progress':
        DataProcessor.exportToCSV(progressData, 'learning-progress');
        break;
      case 'skills':
        DataProcessor.exportToCSV(skillData, 'skill-distribution');
        break;
      case 'trends':
        DataProcessor.exportToCSV(trendData, 'performance-trends');
        break;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with filters and export */}
      <div className="bg-bg-secondary border-border-theme flex flex-col items-start justify-between gap-4 rounded-2xl border p-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-foreground mb-2 text-2xl font-black tracking-tight uppercase">
            Analytics Dashboard
          </h2>
          <p className="text-text-secondary text-sm">
            Comprehensive insights into your learning journey
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-background border-border-theme flex items-center gap-2 rounded-lg border px-3 py-2">
            <Calendar className="text-text-secondary h-4 w-4" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="text-foreground cursor-pointer bg-transparent text-sm outline-none"
              aria-label="Select date range"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>

          <button
            onClick={() => handleExportCSV('progress')}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold tracking-widest text-white uppercase transition-colors hover:bg-red-700"
            aria-label="Export data as CSV"
          >
            <FileDown className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {[
          { label: 'Total Courses', value: '24', change: '+12%' },
          { label: 'Completion Rate', value: '68%', change: '+5%' },
          { label: 'Study Hours', value: '142', change: '+18%' },
          { label: 'Avg Score', value: '87', change: '+3%' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="bg-bg-secondary border-border-theme rounded-2xl border p-6 transition-all hover:border-red-500/50"
          >
            <p className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">
              {metric.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-foreground font-mono text-3xl font-black">{metric.value}</p>
              <span className="text-xs font-bold text-green-500">{metric.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="progress-chart">
          <ProgressChart data={progressData} />
        </div>
        <div id="skill-radar">
          <SkillRadar data={skillData} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="completion-pie">
          <CompletionPie data={completionData} />
        </div>
        <div id="trend-chart">
          <TrendChart data={trendData} />
        </div>
      </div>

      <div id="heatmap">
        <StudyHeatmap data={activityData} />
      </div>

      <div id="time-distribution">
        <TimeDistributionChart data={timeData} />
      </div>

      {/* Insights Panel */}
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <h3 className="text-foreground mb-4 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
          <span className="h-3 w-3 rounded-sm bg-red-600"></span>
          Predictive Insights
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-background rounded-xl border border-green-500/20 p-4">
            <p className="mb-2 text-xs font-bold tracking-widest text-green-500 uppercase">
              On Track
            </p>
            <p className="text-text-secondary text-sm">
              You&apos;re 23% ahead of schedule. Expected completion: 2 weeks early.
            </p>
          </div>
          <div className="bg-background rounded-xl border border-yellow-500/20 p-4">
            <p className="mb-2 text-xs font-bold tracking-widest text-yellow-500 uppercase">
              Skill Gap
            </p>
            <p className="text-text-secondary text-sm">
              Focus on DeFi and Cryptography to balance your skill profile.
            </p>
          </div>
          <div className="bg-background rounded-xl border border-blue-500/20 p-4">
            <p className="mb-2 text-xs font-bold tracking-widest text-blue-500 uppercase">
              Peak Hours
            </p>
            <p className="text-text-secondary text-sm">
              Most productive between 2PM-6PM. Schedule complex topics then.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
