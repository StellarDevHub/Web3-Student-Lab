"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  History, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BarChart3, 
  PieChart, 
  Activity,
  Filter,
  Download,
  Search,
  User,
  Clock,
  Target,
  Award,
  AlertTriangle
} from "lucide-react";
import { ReviewRequest, ReviewSummary, ReviewManager } from "../../lib/review/ReviewManager";

interface ReviewHistoryAnalyticsProps {
  reviewManager: ReviewManager;
  currentUser: {
    id: string;
    name: string;
  };
  timeRange?: "7d" | "30d" | "90d" | "all";
}

interface AnalyticsData {
  totalReviews: number;
  reviewsAuthored: number;
  reviewsReviewed: number;
  averageReviewTime: number;
  averageScoreGiven: number;
  averageScoreReceived: number;
  approvalRate: number;
  rejectionRate: number;
  reviewTrend: Array<{ date: string; authored: number; reviewed: number }>;
  scoreDistribution: Array<{ range: string; count: number }>;
  topReviewers: Array<{ name: string; count: number; avgScore: number }>;
  reviewActivity: Array<{ hour: number; count: number }>;
  categoryBreakdown: Array<{ category: string; count: number; percentage: number }>;
}

export default function ReviewHistoryAnalytics({
  reviewManager,
  currentUser,
  timeRange = "30d",
}: ReviewHistoryAnalyticsProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const calculateAnalytics = () => {
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

      // Calculate basic metrics
      const totalReviews = filteredReviews.length;
      const reviewsAuthored = filteredReviews.filter(r => r.author.id === currentUser.id).length;
      const reviewsReviewed = filteredSummaries.filter(s => s.reviewer.id === currentUser.id).length;

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
      }, 0) / (completedReviewsWithSummaries.length || 1) / (1000 * 60 * 60 * 24);

      // Calculate average scores
      const userSummaries = filteredSummaries.filter(s => s.reviewer.id === currentUser.id);
      const averageScoreGiven = userSummaries.length > 0
        ? userSummaries.reduce((sum, s) => sum + s.overallScore, 0) / userSummaries.length
        : 0;

      const userReviews = filteredReviews.filter(r => r.author.id === currentUser.id);
      const userReviewSummaries = userReviews.flatMap(review => 
        reviewManager.getSummaries(review.id)
      );
      const averageScoreReceived = userReviewSummaries.length > 0
        ? userReviewSummaries.reduce((sum, s) => sum + s.overallScore, 0) / userReviewSummaries.length
        : 0;

      // Calculate approval/rejection rates
      const completedUserReviews = userReviews.filter(r => 
        ["approved", "rejected", "changes_requested"].includes(r.status)
      );
      const approvedUserReviews = userReviews.filter(r => r.status === "approved").length;
      const rejectedUserReviews = userReviews.filter(r => r.status === "rejected").length;
      
      const approvalRate = completedUserReviews.length > 0 
        ? (approvedUserReviews / completedUserReviews.length) * 100 
        : 0;
      const rejectionRate = completedUserReviews.length > 0 
        ? (rejectedUserReviews / completedUserReviews.length) * 100 
        : 0;

      // Calculate review trend (last 7 days)
      const reviewTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(now.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);
        
        const authoredCount = filteredReviews.filter(review => 
          review.author.id === currentUser.id &&
          review.createdAt >= date && review.createdAt < nextDate
        ).length;
        
        const reviewedCount = filteredSummaries.filter(summary => 
          summary.reviewer.id === currentUser.id &&
          summary.submittedAt >= date && summary.submittedAt < nextDate
        ).length;
        
        reviewTrend.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          authored: authoredCount,
          reviewed: reviewedCount,
        });
      }

      // Calculate score distribution
      const scoreRanges = [
        { range: "0-2", min: 0, max: 2, count: 0 },
        { range: "3-4", min: 3, max: 4, count: 0 },
        { range: "5-6", min: 5, max: 6, count: 0 },
        { range: "7-8", min: 7, max: 8, count: 0 },
        { range: "9-10", min: 9, max: 10, count: 0 },
      ];

      userSummaries.forEach(summary => {
        const range = scoreRanges.find(r => summary.overallScore >= r.min && summary.overallScore <= r.max);
        if (range) range.count++;
      });

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

      // Calculate review activity by hour
      const reviewActivity = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: filteredSummaries.filter(summary => {
          const hourSubmitted = summary.submittedAt.getHours();
          return hourSubmitted === hour;
        }).length,
      }));

      // Calculate category breakdown (mock data - would need tags/categories)
      const categoryBreakdown = [
        { category: "Security", count: Math.floor(userSummaries.length * 0.3), percentage: 30 },
        { category: "Performance", count: Math.floor(userSummaries.length * 0.25), percentage: 25 },
        { category: "Code Quality", count: Math.floor(userSummaries.length * 0.35), percentage: 35 },
        { category: "Documentation", count: Math.floor(userSummaries.length * 0.1), percentage: 10 },
      ];

      setAnalyticsData({
        totalReviews,
        reviewsAuthored,
        reviewsReviewed,
        averageReviewTime,
        averageScoreGiven,
        averageScoreReceived,
        approvalRate,
        rejectionRate,
        reviewTrend,
        scoreDistribution: scoreRanges,
        topReviewers,
        reviewActivity,
        categoryBreakdown,
      });
      
      setIsLoading(false);
    };

    calculateAnalytics();
  }, [reviewManager, currentUser.id, selectedTimeRange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12 text-gray-400">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Unable to load analytics data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Review History & Analytics</h2>
          <p className="text-gray-400 mt-1">Your code review performance and insights</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search reviews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
            />
          </div>
          
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
            <History className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-gray-400">Authored</span>
          </div>
          <div className="text-2xl font-bold text-white">{analyticsData.reviewsAuthored}</div>
          <p className="text-sm text-gray-400">Reviews created</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Target className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400">Reviewed</span>
          </div>
          <div className="text-2xl font-bold text-white">{analyticsData.reviewsReviewed}</div>
          <p className="text-sm text-gray-400">Reviews completed</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-gray-400">Avg Time</span>
          </div>
          <div className="text-2xl font-bold text-white">{analyticsData.averageReviewTime.toFixed(1)}d</div>
          <p className="text-sm text-gray-400">Review duration</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <Award className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-gray-400">Avg Score</span>
          </div>
          <div className="text-2xl font-bold text-white">{analyticsData.averageScoreGiven.toFixed(1)}</div>
          <p className="text-sm text-gray-400">Score given</p>
        </motion.div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Score Distribution</h3>
          
          <div className="space-y-3">
            {analyticsData.scoreDistribution.map((range) => (
              <div key={range.range} className="flex items-center space-x-3">
                <span className="text-sm text-gray-400 w-12">{range.range}</span>
                <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400"
                    style={{ 
                      width: `${analyticsData.scoreDistribution.length > 0 ? (range.count / Math.max(...analyticsData.scoreDistribution.map(r => r.count))) * 100 : 0}%` 
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-white w-8 text-right">{range.count}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Approval/Rejection Rates */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Review Outcomes</h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Approval Rate</span>
                <span className="text-lg font-bold text-green-400">{analyticsData.approvalRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-400"
                  style={{ width: `${analyticsData.approvalRate}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Rejection Rate</span>
                <span className="text-lg font-bold text-red-400">{analyticsData.rejectionRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-400"
                  style={{ width: `${analyticsData.rejectionRate}%` }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Activity Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">7-Day Activity</h3>
          
          <div className="space-y-3">
            {analyticsData.reviewTrend.map((day, index) => (
              <div key={day.date} className="flex items-center space-x-3">
                <span className="text-sm text-gray-400 w-16">{day.date}</span>
                <div className="flex-1 flex space-x-1">
                  <div 
                    className="h-6 bg-blue-400 rounded"
                    style={{ 
                      width: `${Math.max(...analyticsData.reviewTrend.map(d => Math.max(d.authored, d.reviewed))) > 0 ? (day.authored / Math.max(...analyticsData.reviewTrend.map(d => Math.max(d.authored, d.reviewed)))) * 100 : 0}%` 
                    }}
                    title={`Authored: ${day.authored}`}
                  />
                  <div 
                    className="h-6 bg-green-400 rounded"
                    style={{ 
                      width: `${Math.max(...analyticsData.reviewTrend.map(d => Math.max(d.authored, d.reviewed))) > 0 ? (day.reviewed / Math.max(...analyticsData.reviewTrend.map(d => Math.max(d.authored, d.reviewed)))) * 100 : 0}%` 
                    }}
                    title={`Reviewed: ${day.reviewed}`}
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-400 rounded" />
              <span className="text-xs text-gray-400">Authored</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-400 rounded" />
              <span className="text-xs text-gray-400">Reviewed</span>
            </div>
          </div>
        </motion.div>

        {/* Hourly Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Review Activity by Hour</h3>
          
          <div className="grid grid-cols-6 gap-2">
            {analyticsData.reviewActivity.map((hour) => (
              <div key={hour.hour} className="text-center">
                <div 
                  className="h-16 bg-blue-400 rounded mb-1"
                  style={{ 
                    opacity: hour.count > 0 ? 0.3 + (hour.count / Math.max(...analyticsData.reviewActivity.map(h => h.count))) * 0.7 : 0.1
                  }}
                />
                <span className="text-xs text-gray-400">{hour.hour}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Reviewers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-zinc-950 border border-white/10 rounded-xl"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Top Reviewers</h3>
        
        <div className="space-y-3">
          {analyticsData.topReviewers.length === 0 ? (
            <p className="text-sm text-gray-400">No review activity yet</p>
          ) : (
            analyticsData.topReviewers.map((reviewer, index) => (
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
    </div>
  );
}
