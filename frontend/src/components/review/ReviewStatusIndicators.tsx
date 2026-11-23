'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  Eye,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import React from 'react';
import { ReviewManager, ReviewRequest } from '../../lib/review/ReviewManager';

interface ReviewStatusIndicatorsProps {
  review: ReviewRequest;
  reviewManager: ReviewManager;
  currentUser: {
    id: string;
    name: string;
  };
  compact?: boolean;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    description: 'Waiting for reviewers to start',
  },
  in_review: {
    icon: Eye,
    label: 'In Review',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: 'Review is in progress',
  },
  approved: {
    icon: CheckCircle,
    label: 'Approved',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    description: 'Code has been approved',
  },
  rejected: {
    icon: XCircle,
    label: 'Rejected',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    description: 'Code needs significant changes',
  },
  changes_requested: {
    icon: Edit3,
    label: 'Changes Requested',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    description: 'Code needs minor changes',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    description: 'Review is completed',
  },
};

const PRIORITY_CONFIG = {
  low: {
    label: 'Low',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
  },
  medium: {
    label: 'Medium',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  high: {
    label: 'High',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  urgent: {
    label: 'Urgent',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};

export default function ReviewStatusIndicators({
  review,
  reviewManager,
  currentUser,
  compact = false,
}: ReviewStatusIndicatorsProps) {
  const summaries = reviewManager.getSummaries(review.id);
  const statusConfig = STATUS_CONFIG[review.status];
  const priorityConfig = PRIORITY_CONFIG[review.priority];

  // Calculate review progress
  const completedReviews = summaries.filter((s) => s.status !== 'pending').length;
  const totalReviewers = review.reviewers.length;
  const reviewProgress = totalReviewers > 0 ? (completedReviews / totalReviewers) * 100 : 0;

  // Calculate average score
  const scoredReviews = summaries.filter((s) => s.overallScore > 0);
  const averageScore =
    scoredReviews.length > 0
      ? scoredReviews.reduce((sum, s) => sum + s.overallScore, 0) / scoredReviews.length
      : 0;

  // Check if current user is a reviewer
  const isReviewer = review.reviewers.some((r) => r.id === currentUser.id);
  const userReview = summaries.find((s) => s.reviewer.id === currentUser.id);

  // Calculate time metrics
  const now = new Date();
  const timeSinceCreation = now.getTime() - review.createdAt.getTime();
  const daysSinceCreation = Math.floor(timeSinceCreation / (1000 * 60 * 60 * 24));

  const isOverdue = review.dueDate && now > review.dueDate;
  const daysUntilDue = review.dueDate
    ? Math.ceil((review.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (compact) {
    return (
      <div className="flex items-center space-x-3">
        {/* Status */}
        <div
          className={`flex items-center space-x-1 rounded-full px-2 py-1 ${statusConfig.bgColor} ${statusConfig.borderColor} border`}
        >
          {React.createElement(statusConfig.icon, { className: `w-3 h-3 ${statusConfig.color}` })}
          <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
        </div>

        {/* Priority */}
        <div
          className={`flex items-center space-x-1 rounded-full px-2 py-1 ${priorityConfig.bgColor}`}
        >
          <span className={`text-xs font-medium ${priorityConfig.color}`}>
            {priorityConfig.label}
          </span>
        </div>

        {/* Progress */}
        <div className="flex items-center space-x-1">
          <div className="h-2 w-16 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${reviewProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">
            {completedReviews}/{totalReviewers}
          </span>
        </div>

        {/* Average Score */}
        {averageScore > 0 && (
          <div className="flex items-center space-x-1">
            <TrendingUp className="h-3 w-3 text-yellow-400" />
            <span className="text-xs text-gray-300">{averageScore.toFixed(1)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Status Card */}
      <div className={`rounded-xl border p-4 ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`rounded-lg p-2 ${statusConfig.bgColor}`}>
              {React.createElement(statusConfig.icon, {
                className: `w-5 h-5 ${statusConfig.color}`,
              })}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{statusConfig.label}</h3>
              <p className="text-sm text-gray-400">{statusConfig.description}</p>
            </div>
          </div>

          <div
            className={`rounded-full px-3 py-1 ${priorityConfig.bgColor} border border-white/10`}
          >
            <span className={`text-sm font-medium ${priorityConfig.color}`}>
              {priorityConfig.label} Priority
            </span>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Review Progress */}
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-white">Review Progress</span>
            </div>
            <span className="text-sm text-gray-400">
              {completedReviews}/{totalReviewers}
            </span>
          </div>

          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${reviewProgress}%` }}
            />
          </div>

          <p className="text-xs text-gray-400">
            {reviewProgress === 0 && 'No reviews started yet'}
            {reviewProgress > 0 &&
              reviewProgress < 100 &&
              `${Math.round(reviewProgress)}% complete`}
            {reviewProgress === 100 && 'All reviews completed'}
          </p>
        </div>

        {/* Average Score */}
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium text-white">Average Score</span>
            </div>
          </div>

          {averageScore > 0 ? (
            <>
              <div className="mb-1 text-2xl font-bold text-white">{averageScore.toFixed(1)}</div>
              <p className="text-xs text-gray-400">
                Based on {scoredReviews.length} review{scoredReviews.length !== 1 ? 's' : ''}
              </p>
            </>
          ) : (
            <>
              <div className="mb-1 text-lg text-gray-400">—</div>
              <p className="text-xs text-gray-400">No scores yet</p>
            </>
          )}
        </div>

        {/* Time Information */}
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-white">Time</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-gray-400">
              Created {daysSinceCreation} day{daysSinceCreation !== 1 ? 's' : ''} ago
            </p>

            {daysUntilDue !== null && (
              <p className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                {isOverdue
                  ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''} overdue`
                  : `${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} until due`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reviewer Status */}
      <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
        <h4 className="mb-3 text-sm font-medium text-white">Reviewer Status</h4>

        <div className="space-y-2">
          {review.reviewers.map((reviewer) => {
            const reviewerSummary = summaries.find((s) => s.reviewer.id === reviewer.id);
            const hasReviewed = reviewerSummary !== undefined;
            const isCurrentUser = reviewer.id === currentUser.id;

            return (
              <div
                key={reviewer.id}
                className="flex items-center justify-between rounded-lg bg-white/5 p-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">
                    {reviewer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm text-white">
                      {reviewer.name}
                      {isCurrentUser && <span className="ml-1 text-xs text-gray-400">(You)</span>}
                    </span>
                    {reviewerSummary && (
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="text-xs text-gray-400">
                          {STATUS_CONFIG[reviewerSummary.status].label}
                        </span>
                        {reviewerSummary.overallScore > 0 && (
                          <span className="text-xs text-yellow-400">
                            {reviewerSummary.overallScore.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {hasReviewed ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-400" />
                  )}

                  {isReviewer && !hasReviewed && (
                    <span className="text-xs text-blue-400">Action Required</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      {isReviewer && !userReview && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="mb-2 flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Your Review Needed</span>
          </div>
          <p className="text-xs text-gray-400">
            You have been assigned to review this code. Please provide your feedback to help improve
            the quality.
          </p>
        </div>
      )}

      {userReview && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="mb-2 flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-white">Your Review Completed</span>
          </div>
          <p className="text-xs text-gray-400">
            You submitted your review on {userReview.submittedAt.toLocaleDateString()} with a score
            of {userReview.overallScore.toFixed(1)}.
          </p>
        </div>
      )}
    </div>
  );
}
