"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Calendar,
  Target,
  Award,
  Activity,
  Filter,
  Download,
  Eye
} from "lucide-react";
import { ReviewRequest, ReviewSummary, ReviewManager } from "../../lib/review/ReviewManager";

interface ReviewSummaryDashboardProps {
  reviewManager: ReviewManager;
  timeRange?: "7d" | "30d" | "90d" | "all";
}

interface DashboardStats {
  totalReviews: number;
  pendingReviews: number;
  inProgressReviews: number;
  completedReviews: number;
  averageReviewTime: number;
  averageScore: number;
  approvalRate: number;
  topReviewers: Array<{ name: string; count: number; avgScore: number }>;
  scoreDistribution: Array<{ range: string; count: number }>;
  reviewTrend: Array<{ date: string; count: number }>;
}

export default function ReviewSummaryDashboard({
  reviewManager,
  timeRange = "30d",
}: ReviewSummaryDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const calculateStats = () => {
      setIsLoading(true);
      
      const allReviews = reviewManager.getAllReviews();
      const allSummaries = Array.from(
        allReviews.flatMap(review => reviewManager.getSummaries(review.id))
      );

      // Filter by time range
      const now = new Date();
      const filterDate = new Date();
      
      switch (selectedTimeRange) {
        case "7d":
          filterDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          filterDate.setDate(now.getDate() - 30);
          break;
        case "90d":
          filterDate.setDate(now.getDate() - 90);
          break;
        case "all":
          filterDate.setFullYear(1970);
          break;
      }

      const filteredReviews = allReviews.filter(review => review.createdAt >= filterDate);
      const filteredSummaries = allSummaries.filter(summary => summary.submittedAt >= filterDate);

      // Calculate basic stats
      const totalReviews = filteredReviews.length;
      const pendingReviews = filteredReviews.filter(r => r.status === "pending").length;
      const inProgressReviews = filteredReviews.filter(r => r.status === "in_review").length;
      const completedReviews = filteredReviews.filter(r => 
        ["approved", "rejected", "changes_requested"].includes(r.status)
      ).length;

      // Calculate average review time
      const completedReviewsWithSummaries = filteredReviews.filter(review => {
        const summaries = reviewManager.getSummaries(review.id);
        return summaries.length > 0 && ["approved", "rejected", "changes_requested"].includes(review.status);
      });

      const averageReviewTime = completedReviewsWithSummaries.reduce((sum, review) => {
        const summaries = reviewManager.getSummaries(review.id);
        if (summaries.length === 0) return sum;
        
        const firstSummary = summaries[0];
        const reviewTime = firstSummary.submittedAt.getTime() - review.createdAt.getTime();
        return sum + reviewTime;
      }, 0) / (completedReviewsWithSummaries.length || 1) / (1000 * 60 * 60 * 24); // Convert to days

      // Calculate average score
      const scoredSummaries = filteredSummaries.filter(s => s.overallScore > 0);
      const averageScore = scoredSummaries.reduce((sum, s) => sum + s.overallScore, 0) / (scoredSummaries.length || 1);

      // Calculate approval rate
      const approvedReviews = filteredReviews.filter(r => r.status === "approved").length;
      const approvalRate = completedReviews > 0 ? (approvedReviews / completedReviews) * 100 : 0;

      // Calculate top reviewers
      const reviewerStats = new Map<string, { count: number; totalScore: number }>();
      filteredSummaries.forEach(summary => {
        const existing = reviewerStats.get(summary.reviewer.name) || { count: 0, totalScore: 0 };
        reviewerStats.set(summary.reviewer.name, {
          count: existing.count + 1,
          totalScore: existing.totalScore + summary.overallScore,
        });
      });

      const topReviewers = Array.from(reviewerStats.entries())
        .map(([name, stats]) => ({
          name,
          count: stats.count,
          avgScore: stats.totalScore / stats.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Calculate score distribution
      const scoreRanges = [
        { range: "0-2", min: 0, max: 2, count: 0 },
        { range: "3-4", min: 3, max: 4, count: 0 },
        { range: "5-6", min: 5, max: 6, count: 0 },
        { range: "7-8", min: 7, max: 8, count: 0 },
        { range: "9-10", min: 9, max: 10, count: 0 },
      ];

      scoredSummaries.forEach(summary => {
        const range = scoreRanges.find(r => summary.overallScore >= r.min && summary.overallScore <= r.max);
        if (range) range.count++;
      });

      // Calculate review trend (last 7 days)
      const reviewTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(now.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);
        
        const dayReviews = filteredReviews.filter(review => 
          review.createdAt >= date && review.createdAt < nextDate
        ).length;
        
        reviewTrend.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          count: dayReviews,
        });
      }

      setStats({
        totalReviews,
        pendingReviews,
        inProgressReviews,
        completedReviews,
        averageReviewTime,
        averageScore,
        approvalRate,
        topReviewers,
        scoreDistribution: scoreRanges,
        reviewTrend,
      });
      
      setIsLoading(false);
    };

    calculateStats();
  }, [reviewManager, selectedTimeRange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Unable to load dashboard statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Review Dashboard</h2>
          <p className="text-gray-400 mt-1">Analytics and insights for code reviews</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          
          <button className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-gray-400">Total</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalReviews}</div>
          <p className="text-sm text-gray-400">Reviews created</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-gray-400">Avg Time</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.averageReviewTime.toFixed(1)}d</div>
          <p className="text-sm text-gray-400">Review duration</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Target className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400">Avg Score</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.averageScore.toFixed(1)}</div>
          <p className="text-sm text-gray-400">Review score</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Award className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-gray-400">Approval</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.approvalRate.toFixed(1)}%</div>
          <p className="text-sm text-gray-400">Approval rate</p>
        </motion.div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Review Status</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-sm text-gray-300">Pending</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.pendingReviews}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span className="text-sm text-gray-300">In Review</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.inProgressReviews}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-sm text-gray-300">Completed</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.completedReviews}</span>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-yellow-400 via-blue-400 to-green-400"
                style={{ 
                  width: `${stats.totalReviews > 0 ? (stats.completedReviews / stats.totalReviews) * 100 : 0}%` 
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Score Distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Score Distribution</h3>
          
          <div className="space-y-3">
            {stats.scoreDistribution.map((range) => (
              <div key={range.range} className="flex items-center space-x-3">
                <span className="text-sm text-gray-400 w-12">{range.range}</span>
                <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400"
                    style={{ 
                      width: `${stats.scoreDistribution.length > 0 ? (range.count / Math.max(...stats.scoreDistribution.map(r => r.count))) * 100 : 0}%` 
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-white w-8 text-right">{range.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Reviewers and Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Reviewers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Top Reviewers</h3>
          
          <div className="space-y-3">
            {stats.topReviewers.length === 0 ? (
              <p className="text-sm text-gray-400">No reviews completed yet</p>
            ) : (
              stats.topReviewers.map((reviewer, index) => (
                <div key={reviewer.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{reviewer.name}</p>
                      <p className="text-xs text-gray-400">{reviewer.count} review{reviewer.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center space-x-1">
                      <Target className="w-3 h-3 text-yellow-400" />
                      <span className="text-sm font-medium text-white">{reviewer.avgScore.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Review Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">7-Day Trend</h3>
          
          <div className="space-y-3">
            {stats.reviewTrend.map((day, index) => (
              <div key={day.date} className="flex items-center space-x-3">
                <span className="text-sm text-gray-400 w-16">{day.date}</span>
                <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-400"
                    style={{ 
                      width: `${Math.max(...stats.reviewTrend.map(d => d.count)) > 0 ? (day.count / Math.max(...stats.reviewTrend.map(d => d.count))) * 100 : 0}%` 
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-white w-8 text-right">{day.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <div className="p-6 bg-zinc-950 border border-white/10 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-3">
            <Eye className="w-5 h-5 text-blue-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">View Pending</p>
              <p className="text-xs text-gray-400">{stats.pendingReviews} reviews waiting</p>
            </div>
          </button>
          
          <button className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-3">
            <Activity className="w-5 h-5 text-green-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Active Reviews</p>
              <p className="text-xs text-gray-400">{stats.inProgressReviews} in progress</p>
            </div>
          </button>
          
          <button className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-purple-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Completed</p>
              <p className="text-xs text-gray-400">{stats.completedReviews} finished</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
