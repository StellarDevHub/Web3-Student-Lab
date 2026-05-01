"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  User, 
  Tag, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Trash2,
  Send,
  X
} from "lucide-react";
import { ReviewRequest, ReviewManager } from "../../lib/review/ReviewManager";

interface ReviewRequestProps {
  reviewManager: ReviewManager;
  currentUser: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  onRequestSelect?: (review: ReviewRequest) => void;
  onCreateRequest?: (review: ReviewRequest) => void;
}

interface CreateReviewFormData {
  title: string;
  description: string;
  code: string;
  language: string;
  reviewers: string[];
  dueDate: string;
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[];
}

const PRIORITY_COLORS = {
  low: "bg-gray-500",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

const STATUS_COLORS = {
  pending: "bg-yellow-500",
  in_review: "bg-blue-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  changes_requested: "bg-orange-500",
};

const STATUS_ICONS = {
  pending: AlertCircle,
  in_review: Eye,
  approved: CheckCircle,
  rejected: XCircle,
  changes_requested: Edit,
};

export default function ReviewRequestComponent({
  reviewManager,
  currentUser,
  onRequestSelect,
  onCreateRequest,
}: ReviewRequestProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedReview, setSelectedReview] = useState<ReviewRequest | null>(null);
  
  const [formData, setFormData] = useState<CreateReviewFormData>({
    title: "",
    description: "",
    code: "",
    language: "typescript",
    reviewers: [],
    dueDate: "",
    priority: "medium",
    tags: [],
  });

  const [newReviewer, setNewReviewer] = useState("");
  const [newTag, setNewTag] = useState("");

  // Get all reviews
  const allReviews = reviewManager.getAllReviews();

  // Filter reviews
  const filteredReviews = allReviews.filter(review => {
    const matchesSearch = review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         review.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || review.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || review.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim() || !formData.code.trim()) {
      return;
    }

    const newReview = reviewManager.createReview({
      title: formData.title.trim(),
      description: formData.description.trim(),
      author: currentUser,
      reviewers: formData.reviewers.map(id => ({
        id,
        name: id, // In real app, this would fetch user details
        email: `${id}@example.com`,
      })),
      code: formData.code,
      language: formData.language,
      status: "pending",
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      tags: formData.tags,
      priority: formData.priority,
    });

    // Reset form
    setFormData({
      title: "",
      description: "",
      code: "",
      language: "typescript",
      reviewers: [],
      dueDate: "",
      priority: "medium",
      tags: [],
    });

    setShowCreateForm(false);
    onCreateRequest?.(newReview);
  };

  // Add reviewer
  const addReviewer = () => {
    if (newReviewer.trim() && !formData.reviewers.includes(newReviewer.trim())) {
      setFormData(prev => ({
        ...prev,
        reviewers: [...prev.reviewers, newReviewer.trim()]
      }));
      setNewReviewer("");
    }
  };

  // Remove reviewer
  const removeReviewer = (reviewer: string) => {
    setFormData(prev => ({
      ...prev,
      reviewers: prev.reviewers.filter(r => r !== reviewer)
    }));
  };

  // Add tag
  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const StatusIcon = (status: ReviewRequest["status"]) => {
    const Icon = STATUS_ICONS[status];
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Review Requests</h2>
          <p className="text-gray-400 mt-1">Manage and track code review requests</p>
        </div>
        
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Request</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-zinc-950 border border-white/10 rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="changes_requested">Changes Requested</option>
          </select>
          
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
          >
            <option value="all">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Review List */}
      <div className="space-y-3">
        {filteredReviews.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No review requests found</p>
            <p className="text-sm mt-2">Create a new request or adjust your filters</p>
          </div>
        ) : (
          filteredReviews.map((review) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-zinc-950 border border-white/10 rounded-lg hover:border-white/20 transition-colors cursor-pointer"
              onClick={() => {
                setSelectedReview(review);
                onRequestSelect?.(review);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{review.title}</h3>
                    
                    <div className={`px-2 py-1 rounded-full text-xs text-white ${PRIORITY_COLORS[review.priority]}`}>
                      {review.priority}
                    </div>
                    
                    <div className={`px-2 py-1 rounded-full text-xs text-white ${STATUS_COLORS[review.status]} flex items-center space-x-1`}>
                      {StatusIcon(review.status)}
                      <span>{review.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  <p className="text-gray-400 mb-3">{review.description}</p>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <User className="w-4 h-4" />
                      <span>{review.author.name}</span>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(review.createdAt)}</span>
                    </div>
                    
                    {review.dueDate && (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>Due {formatDate(review.dueDate)}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-1">
                      <Eye className="w-4 h-4" />
                      <span>{review.reviewers.length} reviewer{review.reviewers.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  
                  {review.tags.length > 0 && (
                    <div className="flex items-center space-x-2 mt-3">
                      <Tag className="w-4 h-4 text-gray-500" />
                      <div className="flex flex-wrap gap-1">
                        {review.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-white/10 text-xs text-gray-300 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Review Form Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-white/20 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Create Review Request</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                    placeholder="Brief description of the code to review"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                    placeholder="Detailed description of what needs to be reviewed"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Code *
                  </label>
                  <textarea
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    rows={8}
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60 font-mono text-sm"
                    placeholder="Paste the code to be reviewed..."
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Language
                    </label>
                    <select
                      value={formData.language}
                      onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="rust">Rust</option>
                      <option value="solidity">Solidity</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.dueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Reviewers
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newReviewer}
                      onChange={(e) => setNewReviewer(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addReviewer())}
                      className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Enter reviewer username"
                    />
                    <button
                      type="button"
                      onClick={addReviewer}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {formData.reviewers.map((reviewer) => (
                      <span
                        key={reviewer}
                        className="px-3 py-1 bg-white/10 text-sm text-white rounded-full flex items-center space-x-1"
                      >
                        <span>{reviewer}</span>
                        <button
                          type="button"
                          onClick={() => removeReviewer(reviewer)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Tags
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Add tags"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-white/10 text-sm text-white rounded-full flex items-center space-x-1"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors flex items-center space-x-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Create Request</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
