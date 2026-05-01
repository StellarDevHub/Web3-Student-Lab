"use client";

import { useState } from "react";
import ProgressChart from "./ProgressChart";
import SkillRadar from "./SkillRadar";
import CompletionPie from "./CompletionPie";
import StudyHeatmap from "./StudyHeatmap";
import TrendChart from "./TrendChart";
import TimeDistributionChart from "./TimeDistributionChart";
import { DataProcessor } from "@/lib/analytics/DataProcessor";
import { FileDown, Calendar } from "lucide-react";

export default function Dashboard() {
  const [dateRange, setDateRange] = useState("30");
  
  const progressData = DataProcessor.generateMockProgressData(parseInt(dateRange));
  const skillData = DataProcessor.generateMockSkillData();
  const completionData = DataProcessor.generateMockCompletionData();
  const activityData = DataProcessor.generateMockActivityData(90);
  const trendData = DataProcessor.generateMockTrendData();
  const timeData = DataProcessor.generateMockTimeData();

  const handleExportCSV = (dataType: string) => {
    switch (dataType) {
      case "progress":
        DataProcessor.exportToCSV(progressData, "learning-progress");
        break;
      case "skills":
        DataProcessor.exportToCSV(skillData, "skill-distribution");
        break;
      case "trends":
        DataProcessor.exportToCSV(trendData, "performance-trends");
        break;
    }
  };


  return (
    <div className="space-y-8">
      {/* Header with filters and export */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bg-secondary border border-border-theme rounded-2xl p-6">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight mb-2">
            Analytics Dashboard
          </h2>
          <p className="text-sm text-text-secondary">
            Comprehensive insights into your learning journey
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-background border border-border-theme rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-text-secondary" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none cursor-pointer"
              aria-label="Select date range"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          
          <button
            onClick={() => handleExportCSV("progress")}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2"
            aria-label="Export data as CSV"
          >
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: "Total Courses", value: "24", change: "+12%" },
          { label: "Completion Rate", value: "68%", change: "+5%" },
          { label: "Study Hours", value: "142", change: "+18%" },
          { label: "Avg Score", value: "87", change: "+3%" },
        ].map((metric) => (
          <div
            key={metric.label}
            className="bg-bg-secondary border border-border-theme rounded-2xl p-6 hover:border-red-500/50 transition-all"
          >
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">
              {metric.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-foreground font-mono">{metric.value}</p>
              <span className="text-xs font-bold text-green-500">{metric.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="progress-chart">
          <ProgressChart data={progressData} />
        </div>
        <div id="skill-radar">
          <SkillRadar data={skillData} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      <div className="bg-bg-secondary border border-border-theme rounded-2xl p-6">
        <h3 className="text-lg font-black text-foreground uppercase tracking-widest mb-4 flex items-center gap-3">
          <span className="w-3 h-3 bg-red-600 rounded-sm"></span>
          Predictive Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-background border border-green-500/20 rounded-xl p-4">
            <p className="text-xs font-bold text-green-500 uppercase tracking-widest mb-2">
              On Track
            </p>
            <p className="text-sm text-text-secondary">
              You&apos;re 23% ahead of schedule. Expected completion: 2 weeks early.
            </p>
          </div>
          <div className="bg-background border border-yellow-500/20 rounded-xl p-4">
            <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-2">
              Skill Gap
            </p>
            <p className="text-sm text-text-secondary">
              Focus on DeFi and Cryptography to balance your skill profile.
            </p>
          </div>
          <div className="bg-background border border-blue-500/20 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-2">
              Peak Hours
            </p>
            <p className="text-sm text-text-secondary">
              Most productive between 2PM-6PM. Schedule complex topics then.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
