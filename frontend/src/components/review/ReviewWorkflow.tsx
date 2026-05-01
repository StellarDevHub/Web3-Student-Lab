"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    BookOpen,
    CheckCircle,
    Clock,
    Edit3,
    MessageSquare,
    Send,
    Shield,
    Star,
    Wrench,
    XCircle,
    Zap
} from "lucide-react";
import React, { useState } from "react";
import { ReviewManager, ReviewRequest, ReviewSummary } from "../../lib/review/ReviewManager";

interface ReviewWorkflowProps {
  review: ReviewRequest;
  reviewManager: ReviewManager;
  currentUser: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  onReviewComplete?: (summary: ReviewSummary) => void;
  onReviewUpdate?: (summary: ReviewSummary) => void;
}

interface ReviewFormData {
  status: "approved" | "rejected" | "changes_requested";
  overallScore: number;
  scores: {
    security: number;
    efficiency: number;
    readability: number;
    maintainability: number;
  };
  comments: string[];
  suggestions: string[];
  summary: string;
}

const CRITERIA_CONFIG = [
  {
    key: "security",
    label: "Security",
    icon: Shield,
    description: "Code security and vulnerability assessment",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
  },
  {
    key: "efficiency",
    label: "Efficiency",
    icon: Zap,
    description: "Performance and optimization",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
  },
  {
    key: "readability",
    label: "Readability",
    icon: BookOpen,
    description: "Code clarity and documentation",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "maintainability",
    label: "Maintainability",
    icon: Wrench,
    description: "Code structure and modularity",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
];

const STATUS_CONFIG = {
  approved: {
    icon: CheckCircle,
    label: "Approve",
    color: "bg-green-600 hover:bg-green-500",
    textColor: "text-green-400",
    bgColor: "bg-green-500/10",
    description: "Code is ready to merge",
  },
  rejected: {
    icon: XCircle,
    label: "Reject",
    color: "bg-red-600 hover:bg-red-500",
    textColor: "text-red-400",
    bgColor: "bg-red-500/10",
    description: "Code needs significant changes",
  },
  changes_requested: {
    icon: Edit3,
    label: "Request Changes",
    color: "bg-orange-600 hover:bg-orange-500",
    textColor: "text-orange-400",
    bgColor: "bg-orange-500/10",
    description: "Code needs minor changes",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    color: "bg-gray-600 hover:bg-gray-500",
    textColor: "text-gray-400",
    bgColor: "bg-gray-500/10",
    description: "Review is pending",
  },
  completed: {
    icon: CheckCircle,
    label: "Completed",
    color: "bg-blue-600 hover:bg-blue-500",
    textColor: "text-blue-400",
    bgColor: "bg-blue-500/10",
    description: "Review is completed",
  },
};

export default function ReviewWorkflow({
  review,
  reviewManager,
  currentUser,
  onReviewComplete,
  onReviewUpdate,
}: ReviewWorkflowProps) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingSummary, setExistingSummary] = useState<ReviewSummary | null>(null);

  const [formData, setFormData] = useState<ReviewFormData>({
    status: "approved",
    overallScore: 7,
    scores: {
      security: 7,
      efficiency: 7,
      readability: 7,
      maintainability: 7,
    },
    comments: [],
    suggestions: [],
    summary: "",
  });

  const [newComment, setNewComment] = useState("");
  const [newSuggestion, setNewSuggestion] = useState("");

  // Check if user has already reviewed
  React.useEffect(() => {
    const summaries = reviewManager.getSummaries(review.id);
    const userSummary = summaries.find(s => s.reviewer.id === currentUser.id);
    setExistingSummary(userSummary || null);

    if (userSummary) {
      setFormData({
        status: userSummary.status as any,
        overallScore: userSummary.overallScore,
        scores: userSummary.scores,
        comments: userSummary.comments,
        suggestions: userSummary.suggestions,
        summary: "", // Summary is not stored in ReviewSummary
      });
    }
  }, [review.id, reviewManager, currentUser.id]);

  // Calculate overall score from individual scores
  const calculateOverallScore = (scores: ReviewFormData["scores"]) => {
    const weights = { security: 0.3, efficiency: 0.25, readability: 0.25, maintainability: 0.2 };
    const weightedScore = Object.entries(scores).reduce((sum, [key, value]) => {
      return sum + (value * weights[key as keyof typeof weights]);
    }, 0);
    return Math.round(weightedScore * 10) / 10;
  };

  // Update overall score when individual scores change
  React.useEffect(() => {
    const overall = calculateOverallScore(formData.scores);
    setFormData(prev => ({ ...prev, overallScore: overall }));
  }, [formData.scores]);

  // Handle score change
  const handleScoreChange = (criterion: keyof ReviewFormData["scores"], value: number) => {
    setFormData(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criterion]: value,
      },
    }));
  };

  // Add comment
  const addComment = () => {
    if (newComment.trim()) {
      setFormData(prev => ({
        ...prev,
        comments: [...prev.comments, newComment.trim()],
      }));
      setNewComment("");
    }
  };

  // Remove comment
  const removeComment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      comments: prev.comments.filter((_, i) => i !== index),
    }));
  };

  // Add suggestion
  const addSuggestion = () => {
    if (newSuggestion.trim()) {
      setFormData(prev => ({
        ...prev,
        suggestions: [...prev.suggestions, newSuggestion.trim()],
      }));
      setNewSuggestion("");
    }
  };

  // Remove suggestion
  const removeSuggestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      suggestions: prev.suggestions.filter((_, i) => i !== index),
    }));
  };

  // Submit review
  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const reviewSummary: Omit<ReviewSummary, "id" | "submittedAt"> = {
        reviewId: review.id,
        reviewer: {
          id: currentUser.id,
          name: currentUser.name,
        },
        status: formData.status,
        overallScore: formData.overallScore,
        scores: formData.scores,
        comments: formData.comments,
        suggestions: formData.suggestions,
      };

      let savedSummary: ReviewSummary;

      if (existingSummary) {
        // Update existing review
        savedSummary = reviewManager.updateSummary(review.id, existingSummary.id, reviewSummary)!;
        onReviewUpdate?.(savedSummary);
      } else {
        // Create new review
        savedSummary = reviewManager.createSummary(review.id, reviewSummary);
        onReviewComplete?.(savedSummary);
      }

      setIsReviewing(false);
    } catch (error) {
      console.error("Error submitting review:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canReview = review.reviewers.some(r => r.id === currentUser.id);
  const hasReviewed = existingSummary !== null;

  return (
    <div className="space-y-6">
      {/* Review Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Review: {review.title}</h3>
          <p className="text-gray-400 mt-1">{review.description}</p>
        </div>

        <div className="flex items-center space-x-3">
          {hasReviewed && (
            <div className={`px-3 py-1 rounded-full text-sm text-white ${STATUS_CONFIG[existingSummary!.status].bgColor} ${STATUS_CONFIG[existingSummary!.status].textColor}`}>
              <div className="flex items-center space-x-1">
                {React.createElement(STATUS_CONFIG[existingSummary!.status].icon, { className: "w-4 h-4" })}
                <span>Already Reviewed</span>
              </div>
            </div>
          )}

          {canReview && (
            <button
              onClick={() => setIsReviewing(!isReviewing)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
            >
              {hasReviewed ? "Edit Review" : "Start Review"}
            </button>
          )}
        </div>
      </div>

      {/* Existing Reviews */}
      <div className="space-y-4">
        <h4 className="text-lg font-semibold text-white">Previous Reviews</h4>

        {reviewManager.getSummaries(review.id).length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No reviews yet</p>
          </div>
        ) : (
          reviewManager.getSummaries(review.id).map((summary) => (
            <motion.div
              key={summary.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-zinc-950 border border-white/10 rounded-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold">
                    {summary.reviewer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium">{summary.reviewer.name}</p>
                    <p className="text-xs text-gray-400">
                      {summary.approvedAt ? `Approved ${summary.approvedAt.toLocaleDateString()}` : `Submitted ${summary.submittedAt.toLocaleDateString()}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-white font-medium">{summary.overallScore.toFixed(1)}</span>
                  </div>

                  <div className={`px-2 py-1 rounded-full text-xs text-white ${STATUS_CONFIG[summary.status].bgColor} ${STATUS_CONFIG[summary.status].textColor}`}>
                    {React.createElement(STATUS_CONFIG[summary.status].icon, { className: "w-3 h-3 inline mr-1" })}
                    {summary.status.replace('_', ' ')}
                  </div>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {CRITERIA_CONFIG.map((criterion) => (
                  <div key={criterion.key} className="text-center">
                    <div className={`w-8 h-8 rounded-full ${criterion.bgColor} ${criterion.color} flex items-center justify-center mx-auto mb-1`}>
                      {React.createElement(criterion.icon, { className: "w-4 h-4" })}
                    </div>
                    <p className="text-xs text-gray-400">{criterion.label}</p>
                    <p className="text-sm font-medium text-white">{summary.scores[criterion.key as keyof typeof summary.scores]}</p>
                  </div>
                ))}
              </div>

              {/* Comments and suggestions */}
              {summary.comments.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium text-white mb-2">Comments</h5>
                  <ul className="space-y-1">
                    {summary.comments.map((comment, index) => (
                      <li key={index} className="text-sm text-gray-300 flex items-start space-x-2">
                        <span className="text-red-400 mt-1">•</span>
                        <span>{comment}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.suggestions.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-white mb-2">Suggestions</h5>
                  <ul className="space-y-1">
                    {summary.suggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm text-gray-300 flex items-start space-x-2">
                        <span className="text-blue-400 mt-1">→</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Review Form */}
      <AnimatePresence>
        {isReviewing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-6 bg-zinc-950 border border-white/10 rounded-lg"
          >
            <h4 className="text-lg font-semibold text-white mb-6">
              {hasReviewed ? "Edit Your Review" : "Submit Your Review"}
            </h4>

            {/* Status Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-3">Review Decision</label>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, status: status as any }))}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      formData.status === status
                        ? `border-white/40 ${config.bgColor} ${config.textColor}`
                        : "border-white/10 hover:border-white/20 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      {React.createElement(config.icon, { className: "w-6 h-6" })}
                      <span className="text-sm font-medium">{config.label}</span>
                      <span className="text-xs text-gray-400 text-center">{config.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Scoring */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-3">Scoring (1-10)</label>
              <div className="grid grid-cols-2 gap-4">
                {CRITERIA_CONFIG.map((criterion) => (
                  <div key={criterion.key} className={`p-3 rounded-lg border ${criterion.bgColor} border-white/10`}>
                    <div className="flex items-center space-x-2 mb-2">
                      {React.createElement(criterion.icon, { className: `w-4 h-4 ${criterion.color}` })}
                      <span className="text-sm font-medium text-white">{criterion.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{criterion.description}</p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={formData.scores[criterion.key as keyof typeof formData.scores]}
                        onChange={(e) => handleScoreChange(criterion.key as keyof typeof formData.scores, parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className={`text-sm font-bold ${criterion.color} w-8 text-center`}>
                        {formData.scores[criterion.key as keyof typeof formData.scores]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Overall Score</span>
                  <div className="flex items-center space-x-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-lg font-bold text-white">{formData.overallScore.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-3">Comments</label>
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                />
                <button
                  type="button"
                  onClick={addComment}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                >
                  Add
                </button>
              </div>

              {formData.comments.length > 0 && (
                <div className="space-y-2">
                  {formData.comments.map((comment, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <span className="text-sm text-gray-300">{comment}</span>
                      <button
                        type="button"
                        onClick={() => removeComment(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggestions */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-3">Suggestions</label>
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={newSuggestion}
                  onChange={(e) => setNewSuggestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSuggestion()}
                  placeholder="Add a suggestion..."
                  className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                />
                <button
                  type="button"
                  onClick={addSuggestion}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Add
                </button>
              </div>

              {formData.suggestions.length > 0 && (
                <div className="space-y-2">
                  {formData.suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <span className="text-sm text-gray-300">{suggestion}</span>
                      <button
                        type="button"
                        onClick={() => removeSuggestion(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsReviewing(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{hasReviewed ? "Update Review" : "Submit Review"}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
