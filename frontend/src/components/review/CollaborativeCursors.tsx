"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CommentSyncUser } from "../../lib/review/CommentSync";

interface CollaborativeCursorsProps {
  editor: any;
  monaco: any;
  users: CommentSyncUser[];
  currentUser: CommentSyncUser;
  onUserCursorUpdate?: (userId: string, position: { line: number; column: number }) => void;
  onUserSelectionUpdate?: (userId: string, selection: { start: { line: number; column: number }; end: { line: number; column: number } }) => void;
}

interface CursorDecoration {
  userId: string;
  decorationId: string;
  line: number;
  column: number;
  user: CommentSyncUser;
}

interface SelectionDecoration {
  userId: string;
  decorationId: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  user: CommentSyncUser;
}

export default function CollaborativeCursors({
  editor,
  monaco,
  users,
  currentUser,
  onUserCursorUpdate,
  onUserSelectionUpdate,
}: CollaborativeCursorsProps) {
  const [cursorDecorations, setCursorDecorations] = useState<CursorDecoration[]>([]);
  const [selectionDecorations, setSelectionDecorations] = useState<SelectionDecoration[]>([]);
  const decorationsRef = useRef<{
    cursors: Map<string, string>;
    selections: Map<string, string>;
  }>({
    cursors: new Map(),
    selections: new Map(),
  });

  // Generate cursor decoration
  const createCursorDecoration = (user: CommentSyncUser, position: { line: number; column: number }) => {
    if (!editor || !monaco) return null;

    const decorationId = editor.deltaDecorations([], [{
      range: new monaco.Range(
        position.line,
        position.column,
        position.line,
        position.column
      ),
      options: {
        className: `collaborative-cursor-${user.id}`,
        hoverMessage: {
          value: `${user.name}'s cursor`
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        afterContentClassName: `collaborative-cursor-after-${user.id}`,
        afterContent: user.name.charAt(0).toUpperCase(),
      }
    }])[0];

    return decorationId;
  };

  // Generate selection decoration
  const createSelectionDecoration = (user: CommentSyncUser, selection: { start: { line: number; column: number }; end: { line: number; column: number } }) => {
    if (!editor || !monaco) return null;

    const decorationId = editor.deltaDecorations([], [{
      range: new monaco.Range(
        selection.start.line,
        selection.start.column,
        selection.end.line,
        selection.end.column
      ),
      options: {
        className: `collaborative-selection-${user.id}`,
        hoverMessage: {
          value: `${user.name}'s selection`
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        isWholeLine: false,
      }
    }])[0];

    return decorationId;
  };

  // Update cursor styles
  const updateCursorStyles = (user: CommentSyncUser) => {
    if (!document) return;

    const cursorId = `collaborative-cursor-${user.id}`;
    const cursorAfterId = `collaborative-cursor-after-${user.id}`;
    const selectionId = `collaborative-selection-${user.id}`;

    // Remove existing styles for this user
    const existingCursorStyle = document.getElementById(cursorId);
    const existingCursorAfterStyle = document.getElementById(cursorAfterId);
    const existingSelectionStyle = document.getElementById(selectionId);

    if (existingCursorStyle) existingCursorStyle.remove();
    if (existingCursorAfterStyle) existingCursorAfterStyle.remove();
    if (existingSelectionStyle) existingSelectionStyle.remove();

    // Add cursor styles
    const cursorStyle = document.createElement('style');
    cursorStyle.id = cursorId;
    cursorStyle.textContent = `
      .${cursorId} {
        border-left: 2px solid ${user.color};
        position: relative;
        animation: blink-cursor-${user.id} 1s infinite;
      }
      @keyframes blink-cursor-${user.id} {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    `;
    document.head.appendChild(cursorStyle);

    // Add cursor after content styles
    const cursorAfterStyle = document.createElement('style');
    cursorAfterStyle.id = cursorAfterId;
    cursorAfterStyle.textContent = `
      .${cursorAfterId}::after {
        content: attr(data-after-content);
        position: absolute;
        top: -20px;
        left: 2px;
        background-color: ${user.color};
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
      }
    `;
    document.head.appendChild(cursorAfterStyle);

    // Add selection styles
    const selectionStyle = document.createElement('style');
    selectionStyle.id = selectionId;
    selectionStyle.textContent = `
      .${selectionId} {
        background-color: ${user.color}20;
        border: 1px solid ${user.color}40;
      }
    `;
    document.head.appendChild(selectionStyle);
  };

  // Update all decorations
  const updateDecorations = () => {
    if (!editor) return;

    // Clear existing decorations
    const existingCursorIds = Array.from(decorationsRef.current.cursors.values());
    const existingSelectionIds = Array.from(decorationsRef.current.selections.values());
    
    editor.deltaDecorations([...existingCursorIds, ...existingSelectionIds], []);
    decorationsRef.current.cursors.clear();
    decorationsRef.current.selections.clear();

    // Add new decorations for each user (except current user)
    users.forEach(user => {
      if (user.id === currentUser.id) return;

      // Update cursor styles
      updateCursorStyles(user);

      // Add cursor decoration
      if (user.cursor) {
        const cursorDecorationId = createCursorDecoration(user, user.cursor);
        if (cursorDecorationId) {
          decorationsRef.current.cursors.set(user.id, cursorDecorationId);
        }
      }

      // Add selection decoration
      if (user.selection) {
        const selectionDecorationId = createSelectionDecoration(user, user.selection);
        if (selectionDecorationId) {
          decorationsRef.current.selections.set(user.id, selectionDecorationId);
        }
      }
    });
  };

  // Handle editor cursor/selection changes
  useEffect(() => {
    if (!editor || !monaco) return;

    const handleCursorPositionChange = () => {
      const position = editor.getPosition();
      if (position) {
        const cursorPos = {
          line: position.lineNumber,
          column: position.column,
        };
        
        // Notify parent component of cursor change
        if (onUserCursorUpdate) {
          onUserCursorUpdate(currentUser.id, cursorPos);
        }
      }
    };

    const handleSelectionChange = () => {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectionRange = {
          start: {
            line: selection.startLineNumber,
            column: selection.startColumn,
          },
          end: {
            line: selection.endLineNumber,
            column: selection.endColumn,
          },
        };
        
        // Notify parent component of selection change
        if (onUserSelectionUpdate) {
          onUserSelectionUpdate(currentUser.id, selectionRange);
        }
      }
    };

    // Register event listeners
    const cursorDisposable = editor.onDidChangeCursorPosition(handleCursorPositionChange);
    const selectionDisposable = editor.onDidChangeCursorSelection(handleSelectionChange);

    return () => {
      cursorDisposable.dispose();
      selectionDisposable.dispose();
    };
  }, [editor, monaco, currentUser, onUserCursorUpdate, onUserSelectionUpdate]);

  // Update decorations when users change
  useEffect(() => {
    updateDecorations();
  }, [users, editor, monaco, currentUser]);

  // Cleanup styles on unmount
  useEffect(() => {
    return () => {
      users.forEach(user => {
        const cursorId = `collaborative-cursor-${user.id}`;
        const cursorAfterId = `collaborative-cursor-after-${user.id}`;
        const selectionId = `collaborative-selection-${user.id}`;

        const cursorStyle = document.getElementById(cursorId);
        const cursorAfterStyle = document.getElementById(cursorAfterId);
        const selectionStyle = document.getElementById(selectionId);

        if (cursorStyle) cursorStyle.remove();
        if (cursorAfterStyle) cursorAfterStyle.remove();
        if (selectionStyle) selectionStyle.remove();
      });
    };
  }, [users]);

  // Active users indicator
  const activeUsers = users.filter(user => user.id !== currentUser.id);

  return (
    <div className="absolute top-4 left-4 z-40">
      <div className="flex items-center space-x-2 bg-black/50 border border-white/20 rounded-lg px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-white font-medium">
            {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} active
          </span>
        </div>
        
        {activeUsers.length > 0 && (
          <div className="flex items-center space-x-1 ml-2 pl-2 border-l border-white/20">
            {activeUsers.slice(0, 3).map(user => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-black/50"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                
                {/* User tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {user.name}
                  {user.cursor && (
                    <div className="text-gray-400">
                      Line {user.cursor.line}, Col {user.cursor.column}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {activeUsers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold border-2 border-black/50">
                +{activeUsers.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
