"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Edit2, Trash2, Reply, Send, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface CommentThread {
  id: string;
  line: number;
  author: {
    id: string;
    name: string;
    avatar?: string;
    color: string;
  };
  content: string;
  timestamp: Date;
  replies: CommentReply[];
  isResolved: boolean;
}

export interface CommentReply {
  id: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    color: string;
  };
  content: string;
  timestamp: Date;
}

interface InlineCommentProps {
  comment: CommentThread;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string, content: string) => void;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  currentUser: {
    id: string;
    name: string;
    color: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

export default function InlineComment({
  comment,
  onEdit,
  onDelete,
  onReply,
  onResolve,
  onUnresolve,
  currentUser,
  isActive = false,
  onClick,
}: InlineCommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replyContent, setReplyContent] = useState("");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showReplyForm && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [showReplyForm]);

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== comment.content) {
      onEdit(comment.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  const handleReply = () => {
    if (replyContent.trim()) {
      onReply(comment.id, replyContent);
      setReplyContent("");
      setShowReplyForm(false);
    }
  };

  const canEdit = currentUser.id === comment.author.id;
  const canDelete = currentUser.id === comment.author.id;
  const isOwnComment = currentUser.id === comment.author.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`relative group ${
        isActive ? "z-50" : "z-40"
      }`}
    >
      {/* Comment Thread */}
      <div
        onClick={onClick}
        className={`absolute left-0 transform -translate-x-full cursor-pointer ${
          isActive ? "-translate-x-full" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center space-x-2">
          {/* Comment indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              comment.isResolved ? "bg-green-500" : "bg-yellow-500"
            } ${isActive ? "ring-2 ring-white ring-offset-2 ring-offset-black" : ""}`}
          />
          
          {/* Comment bubble */}
          <div
            className={`max-w-xs rounded-lg border p-3 backdrop-blur-sm transition-all ${
              isActive
                ? "border-red-500/40 bg-red-500/10 shadow-lg shadow-red-500/20"
                : "border-white/20 bg-white/5 opacity-90 hover:opacity-100 hover:bg-white/10"
            } ${comment.isResolved ? "opacity-60" : ""}`}
          >
            {/* Comment header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: comment.author.color }}
                >
                  {comment.author.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">
                    {comment.author.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(comment.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              {/* Comment actions */}
              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    title="Edit comment"
                  >
                    <Edit2 className="w-3 h-3 text-gray-400" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(comment.id);
                    }}
                    className="p-1 rounded hover:bg-red-500/20 transition-colors"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    comment.isResolved ? onUnresolve(comment.id) : onResolve(comment.id);
                  }}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  title={comment.isResolved ? "Reopen comment" : "Resolve comment"}
                >
                  <X className={`w-3 h-3 ${comment.isResolved ? "text-green-400" : "text-gray-400"}`} />
                </button>
              </div>
            </div>

            {/* Comment content */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-2 text-xs bg-black/50 border border-white/20 rounded text-white resize-none focus:outline-none focus:border-red-500/60"
                  rows={3}
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-300 leading-relaxed">
                {comment.content}
              </div>
            )}

            {/* Replies */}
            {comment.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex space-x-2">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: reply.author.color }}
                    >
                      {reply.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-semibold text-white">
                          {reply.author.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(reply.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 break-words">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply form */}
            <AnimatePresence>
              {showReplyForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2 border-t border-white/10 pt-3"
                >
                  <textarea
                    ref={replyInputRef}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="w-full p-2 text-xs bg-black/50 border border-white/20 rounded text-white resize-none focus:outline-none focus:border-red-500/60"
                    rows={2}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleReply}
                      disabled={!replyContent.trim()}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setShowReplyForm(false);
                        setReplyContent("");
                      }}
                      className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reply button */}
            {!showReplyForm && !comment.isResolved && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReplyForm(true);
                }}
                className="mt-2 flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <Reply className="w-3 h-3" />
                <span>Reply</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
