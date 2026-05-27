'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Edit2, Trash2, Reply, Send, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [replyContent, setReplyContent] = useState('');
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
      setReplyContent('');
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
      className={`group relative ${isActive ? 'z-50' : 'z-40'}`}
    >
      {/* Comment Thread */}
      <div
        onClick={onClick}
        className={`absolute left-0 -translate-x-full transform cursor-pointer ${
          isActive ? '-translate-x-full' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center space-x-2">
          {/* Comment indicator */}
          <div
            className={`h-2 w-2 rounded-full ${
              comment.isResolved ? 'bg-green-500' : 'bg-yellow-500'
            } ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
          />

          {/* Comment bubble */}
          <div
            className={`max-w-xs rounded-lg border p-3 backdrop-blur-sm transition-all ${
              isActive
                ? 'border-red-500/40 bg-red-500/10 shadow-lg shadow-red-500/20'
                : 'border-white/20 bg-white/5 opacity-90 hover:bg-white/10 hover:opacity-100'
            } ${comment.isResolved ? 'opacity-60' : ''}`}
          >
            {/* Comment header */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: comment.author.color }}
                >
                  {comment.author.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">{comment.author.name}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(comment.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Comment actions */}
              <div className="flex items-center space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className="rounded p-1 transition-colors hover:bg-white/10"
                    title="Edit comment"
                  >
                    <Edit2 className="h-3 w-3 text-gray-400" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(comment.id);
                    }}
                    className="rounded p-1 transition-colors hover:bg-red-500/20"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    comment.isResolved ? onUnresolve(comment.id) : onResolve(comment.id);
                  }}
                  className="rounded p-1 transition-colors hover:bg-white/10"
                  title={comment.isResolved ? 'Reopen comment' : 'Resolve comment'}
                >
                  <X
                    className={`h-3 w-3 ${comment.isResolved ? 'text-green-400' : 'text-gray-400'}`}
                  />
                </button>
              </div>
            </div>

            {/* Comment content */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full resize-none rounded border border-white/20 bg-black/50 p-2 text-xs text-white focus:border-red-500/60 focus:outline-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button
                    onClick={handleSaveEdit}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-500"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="rounded bg-gray-600 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs leading-relaxed text-gray-300">{comment.content}</div>
            )}

            {/* Replies */}
            {comment.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex space-x-2">
                    <div
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: reply.author.color }}
                    >
                      {reply.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white">
                          {reply.author.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(reply.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs break-words text-gray-300">{reply.content}</p>
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
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2 border-t border-white/10 pt-3"
                >
                  <textarea
                    ref={replyInputRef}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="w-full resize-none rounded border border-white/20 bg-black/50 p-2 text-xs text-white focus:border-red-500/60 focus:outline-none"
                    rows={2}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleReply}
                      disabled={!replyContent.trim()}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => {
                        setShowReplyForm(false);
                        setReplyContent('');
                      }}
                      className="rounded bg-gray-600 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-500"
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
                className="mt-2 flex items-center space-x-1 text-xs text-gray-400 transition-colors hover:text-white"
              >
                <Reply className="h-3 w-3" />
                <span>Reply</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
