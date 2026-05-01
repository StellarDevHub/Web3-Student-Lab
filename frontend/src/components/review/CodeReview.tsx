"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Editor, OnMount } from "@monaco-editor/react";
import { MessageCircle, Plus, Users, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import InlineComment, { CommentThread, CommentReply } from "./InlineComment";

interface CodeReviewProps {
  code: string;
  language?: string;
  roomId?: string;
  height?: string;
  readOnly?: boolean;
  onCodeChange?: (code: string) => void;
  currentUser?: {
    id: string;
    name: string;
    color: string;
  };
}

interface CommentPosition {
  line: number;
  column: number;
}

const DEFAULT_USER = {
  id: "current-user",
  name: "Current User",
  color: "#f87171",
};

export default function CodeReview({
  code,
  language = "typescript",
  roomId = "default-room",
  height = "500px",
  readOnly = false,
  onCodeChange,
  currentUser = DEFAULT_USER,
}: CodeReviewProps) {
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newCommentLine, setNewCommentLine] = useState<number | null>(null);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [showComments, setShowComments] = useState(true);
  const [commentPositions, setCommentPositions] = useState<Map<number, CommentPosition>>(new Map());
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  // Generate unique ID for comments
  const generateId = () => `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Update comment decorations in editor
  const updateDecorations = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    // Clear existing decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);

    if (!showComments) return;

    // Create new decorations for comments
    const decorations = comments.map((comment) => ({
      range: new monaco.Range(
        comment.line,
        1,
        comment.line,
        1
      ),
      options: {
        isWholeLine: true,
        className: comment.isResolved 
          ? "comment-decoration-resolved" 
          : "comment-decoration",
        glyphMarginClassName: comment.isResolved
          ? "comment-glyph-resolved"
          : "comment-glyph",
        hoverMessage: {
          value: `${comment.author.name}: ${comment.content.substring(0, 100)}${comment.content.length > 100 ? "..." : ""}`
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }));

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }, [comments, showComments]);

  // Handle editor mount
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom styles for comment decorations
    monaco.editor.defineTheme("code-review-theme", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6B7280", fontStyle: "italic" },
        { token: "keyword", foreground: "F87171", fontStyle: "bold" },
        { token: "string", foreground: "34D399" },
      ],
      colors: {
        "editor.background": "#09090b",
        "editor.lineHighlightBackground": "#111827",
        "editorCursor.foreground": "#f87171",
        "editorGutter.background": "#09090b",
      },
    });

    monaco.editor.setTheme("code-review-theme");

    // Add CSS for comment decorations
    const style = document.createElement("style");
    style.textContent = `
      .comment-decoration {
        background-color: rgba(239, 68, 68, 0.1);
        border-left: 3px solid #ef4444;
      }
      .comment-decoration-resolved {
        background-color: rgba(34, 197, 94, 0.1);
        border-left: 3px solid #22c55e;
      }
      .comment-glyph {
        background-color: #ef4444;
        border-radius: 50%;
        width: 8px !important;
        height: 8px !important;
        margin: 2px;
      }
      .comment-glyph-resolved {
        background-color: #22c55e;
        border-radius: 50%;
        width: 8px !important;
        height: 8px !important;
        margin: 2px;
      }
    `;
    document.head.appendChild(style);

    // Handle line click for adding comments
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || 
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const line = e.target.position.lineNumber;
        startAddingComment(line);
      }
    });

    updateDecorations();
  };

  // Start adding a comment
  const startAddingComment = (line: number) => {
    if (readOnly) return;
    
    setNewCommentLine(line);
    setNewCommentContent("");
    setIsAddingComment(true);
    setActiveCommentId(null);
  };

  // Add new comment
  const addComment = () => {
    if (!newCommentContent.trim() || newCommentLine === null) return;

    const newComment: CommentThread = {
      id: generateId(),
      line: newCommentLine,
      author: currentUser,
      content: newCommentContent.trim(),
      timestamp: new Date(),
      replies: [],
      isResolved: false,
    };

    setComments((prev) => [...prev, newComment]);
    setIsAddingComment(false);
    setNewCommentLine(null);
    setNewCommentContent("");
    setActiveCommentId(newComment.id);
  };

  // Edit comment
  const editComment = (commentId: string, content: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, content, timestamp: new Date() }
          : comment
      )
    );
  };

  // Delete comment
  const deleteComment = (commentId: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    if (activeCommentId === commentId) {
      setActiveCommentId(null);
    }
  };

  // Add reply to comment
  const addReply = (commentId: string, content: string) => {
    const newReply: CommentReply = {
      id: generateId(),
      author: currentUser,
      content: content.trim(),
      timestamp: new Date(),
    };

    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, replies: [...comment.replies, newReply] }
          : comment
      )
    );
  };

  // Resolve/unresolve comment
  const toggleCommentResolution = (commentId: string, isResolved: boolean) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, isResolved }
          : comment
      )
    );
  };

  // Update decorations when comments change
  useEffect(() => {
    updateDecorations();
  }, [comments, updateDecorations]);

  // Get comments for a specific line
  const getCommentsForLine = (line: number) => {
    return comments.filter((comment) => comment.line === line);
  };

  // Get unique lines with comments
  const getLinesWithComments = () => {
    return Array.from(new Set(comments.map((comment) => comment.line))).sort((a, b) => a - b);
  };

  return (
    <div className="relative">
      {/* Editor */}
      <div className="relative rounded-3xl border border-white/10 overflow-hidden">
        <Editor
          height={height}
          language={language}
          value={code}
          onChange={onCodeChange}
          onMount={handleEditorMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            glyphMargin: true,
            lineDecorationsWidth: 20,
            lineNumbersMinChars: 3,
            folding: true,
            wordWrap: "on",
          }}
        />
      </div>

      {/* Comment controls */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <button
          onClick={() => setShowComments(!showComments)}
          className="p-2 rounded-lg bg-black/50 border border-white/20 text-white hover:bg-white/10 transition-colors"
          title={showComments ? "Hide comments" : "Show comments"}
        >
          {showComments ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        
        <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-black/50 border border-white/20">
          <MessageCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-white">{comments.length}</span>
        </div>
      </div>

      {/* Add comment form */}
      <AnimatePresence>
        {isAddingComment && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-20 right-4 w-80 bg-zinc-950 border border-white/20 rounded-2xl p-4 shadow-xl z-50"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">
                Add comment on line {newCommentLine}
              </h3>
              <button
                onClick={() => {
                  setIsAddingComment(false);
                  setNewCommentLine(null);
                  setNewCommentContent("");
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            
            <textarea
              value={newCommentContent}
              onChange={(e) => setNewCommentContent(e.target.value)}
              placeholder="Leave a comment..."
              className="w-full p-3 text-sm bg-black/50 border border-white/20 rounded-lg text-white resize-none focus:outline-none focus:border-red-500/60"
              rows={4}
              autoFocus
            />
            
            <div className="flex space-x-2 mt-3">
              <button
                onClick={addComment}
                disabled={!newCommentContent.trim()}
                className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Comment
              </button>
              <button
                onClick={() => {
                  setIsAddingComment(false);
                  setNewCommentLine(null);
                  setNewCommentContent("");
                }}
                className="px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment threads */}
      <AnimatePresence>
        {showComments && (
          <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
            {getLinesWithComments().map((line) => {
              const lineComments = getCommentsForLine(line);
              return lineComments.map((comment, index) => (
                <div
                  key={comment.id}
                  className="absolute pointer-events-auto"
                  style={{
                    top: `${(line - 1) * 20}px`,
                    left: "-20px",
                    transform: "translateX(-100%)",
                    zIndex: activeCommentId === comment.id ? 50 : 40 + index,
                  }}
                >
                  <InlineComment
                    comment={comment}
                    onEdit={editComment}
                    onDelete={deleteComment}
                    onReply={addReply}
                    onResolve={(id) => toggleCommentResolution(id, true)}
                    onUnresolve={(id) => toggleCommentResolution(id, false)}
                    currentUser={currentUser}
                    isActive={activeCommentId === comment.id}
                    onClick={() => setActiveCommentId(
                      activeCommentId === comment.id ? null : comment.id
                    )}
                  />
                </div>
              ));
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
