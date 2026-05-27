'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  Eye,
} from 'lucide-react';
import { ReviewRequest, ReviewSummary, ReviewManager } from '../../lib/review/ReviewManager';

interface ReviewSummaryDashboardProps {
  reviewManager: ReviewManager;
  timeRange?: '7d' | '30d' | '90d' | 'all';
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
  timeRange = '30d',
}: ReviewSummaryDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const calculateStats = () => {
      setIsLoading(true);

      const allReviews = reviewManager.getAllReviews();
      const allSummaries = Array.from(
        allReviews.flatMap((review) => reviewManager.getSummaries(review.id))
      );

      // Filter by time range
      const now = new Date();
      const filterDate = new Date();

      switch (selectedTimeRange) {
        case '7d':
          filterDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          filterDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          filterDate.setDate(now.getDate() - 90);
          break;
        case 'all':
          filterDate.setFullYear(1970);
          break;
      }

      const filteredReviews = allReviews.filter((review) => review.createdAt >= filterDate);
      const filteredSummaries = allSummaries.filter((summary) => summary.submittedAt >= filterDate);

      // Calculate basic stats
      const totalReviews = filteredReviews.length;
      const pendingReviews = filteredReviews.filter((r) => r.status === 'pending').length;
      const inProgressReviews = filteredReviews.filter((r) => r.status === 'in_review').length;
      const completedReviews = filteredReviews.filter((r) =>
        ['approved', 'rejected', 'changes_requested'].includes(r.status)
      ).length;

      // Calculate average review time
      const completedReviewsWithSummaries = filteredReviews.filter((review) => {
        const summaries = reviewManager.getSummaries(review.id);
        return (
          summaries.length > 0 &&
          ['approved', 'rejected', 'changes_requested'].includes(review.status)
        );
      });

      const averageReviewTime =
        completedReviewsWithSummaries.reduce((sum, review) => {
          const summaries = reviewManager.getSummaries(review.id);
          if (summaries.length === 0) return sum;

          const firstSummary = summaries[0];
          const reviewTime = firstSummary.submittedAt.getTime() - review.createdAt.getTime();
          return sum + reviewTime;
        }, 0) /
        (completedReviewsWithSummaries.length || 1) /
        (1000 * 60 * 60 * 24); // Convert to days

      // Calculate average score
      const scoredSummaries = filteredSummaries.filter((s) => s.overallScore > 0);
      const averageScore =
        scoredSummaries.reduce((sum, s) => sum + s.overallScore, 0) / (scoredSummaries.length || 1);

      // Calculate approval rate
      const approvedReviews = filteredReviews.filter((r) => r.status === 'approved').length;
      const approvalRate = completedReviews > 0 ? (approvedReviews / completedReviews) * 100 : 0;

      // Calculate top reviewers
      const reviewerStats = new Map<string, { count: number; totalScore: number }>();
      filteredSummaries.forEach((summary) => {
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
        { range: '0-2', min: 0, max: 2, count: 0 },
        { range: '3-4', min: 3, max: 4, count: 0 },
        { range: '5-6', min: 5, max: 6, count: 0 },
        { range: '7-8', min: 7, max: 8, count: 0 },
        { range: '9-10', min: 9, max: 10, count: 0 },
      ];

      scoredSummaries.forEach((summary) => {
        const range = scoreRanges.find(
          (r) => summary.overallScore >= r.min && summary.overallScore <= r.max
        );
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

        const dayReviews = filteredReviews.filter(
          (review) => review.createdAt >= date && review.createdAt < nextDate
        ).length;

        reviewTrend.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-12 text-center text-gray-400">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
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
          <p className="mt-1 text-gray-400">Analytics and insights for code reviews</p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-white focus:border-red-500/60 focus:outline-none"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>

          <button className="flex items-center space-x-2 rounded-lg bg-red-600 px-3 py-2 text-white transition-colors hover:bg-red-500">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            <span className="text-xs text-gray-400">Total</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalReviews}</div>
          <p className="text-sm text-gray-400">Reviews created</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <Clock className="h-5 w-5 text-yellow-400" />
            <span className="text-xs text-gray-400">Avg Time</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.averageReviewTime.toFixed(1)}d</div>
          <p className="text-sm text-gray-400">Review duration</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <Target className="h-5 w-5 text-green-400" />
            <span className="text-xs text-gray-400">Avg Score</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.averageScore.toFixed(1)}</div>
          <p className="text-sm text-gray-400">Review score</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <Award className="h-5 w-5 text-purple-400" />
            <span className="text-xs text-gray-400">Approval</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.approvalRate.toFixed(1)}%</div>
          <p className="text-sm text-gray-400">Approval rate</p>
        </motion.div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Breakdown */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-white">Review Status</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="text-sm text-gray-300">Pending</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.pendingReviews}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-blue-400" />
                <span className="text-sm text-gray-300">In Review</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.inProgressReviews}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-green-400" />
                <span className="text-sm text-gray-300">Completed</span>
              </div>
              <span className="text-sm font-medium text-white">{stats.completedReviews}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 via-blue-400 to-green-400"
                style={{
                  width: `${stats.totalReviews > 0 ? (stats.completedReviews / stats.totalReviews) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Score Distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-white">Score Distribution</h3>

          <div className="space-y-3">
            {stats.scoreDistribution.map((range) => (
              <div key={range.range} className="flex items-center space-x-3">
                <span className="w-12 text-sm text-gray-400">{range.range}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400"
                    style={{
                      width: `${stats.scoreDistribution.length > 0 ? (range.count / Math.max(...stats.scoreDistribution.map((r) => r.count))) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-medium text-white">{range.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Reviewers and Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Reviewers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-zinc-950 p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-white">Top Reviewers</h3>

          <div className="space-y-3">
            {stats.topReviewers.length === 0 ? (
              <p className="text-sm text-gray-400">No reviews completed yet</p>
            ) : (
              stats.topReviewers.map((reviewer, index) => (
                <div key={reviewer.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20 text-sm font-bold text-red-400">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{reviewer.name}</p>
                      <p className="text-xs text-gray-400">
                        {reviewer.count} review{reviewer.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center space-x-1">
                      <Target className="h-3 w-3 text-yellow-400" />
                      <span className="text-sm font-medium text-white">
                        {reviewer.avgScore.toFixed(1)}
                      </span>
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
          className="rounded-xl border border-white/10 bg-zinc-950 p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-white">7-Day Trend</h3>

          <div className="space-y-3">
            {stats.reviewTrend.map((day, index) => (
              <div key={day.date} className="flex items-center space-x-3">
                <span className="w-16 text-sm text-gray-400">{day.date}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-blue-400"
                    style={{
                      width: `${Math.max(...stats.reviewTrend.map((d) => d.count)) > 0 ? (day.count / Math.max(...stats.reviewTrend.map((d) => d.count))) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-medium text-white">{day.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-white/10 bg-zinc-950 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <button className="flex items-center space-x-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
            <Eye className="h-5 w-5 text-blue-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">View Pending</p>
              <p className="text-xs text-gray-400">{stats.pendingReviews} reviews waiting</p>
            </div>
          </button>

          <button className="flex items-center space-x-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
            <Activity className="h-5 w-5 text-green-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Active Reviews</p>
              <p className="text-xs text-gray-400">{stats.inProgressReviews} in progress</p>
            </div>
          </button>

          <button className="flex items-center space-x-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
            <CheckCircle className="h-5 w-5 text-purple-400" />
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
