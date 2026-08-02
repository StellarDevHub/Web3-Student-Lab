'use client';

import { DiffEditor } from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Code,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Lightbulb,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';

interface CodeSuggestion {
  id: string;
  title: string;
  description: string;
  originalCode: string;
  suggestedCode: string;
  language: string;
  type: 'improvement' | 'bug_fix' | 'optimization' | 'style';
  severity: 'low' | 'medium' | 'high' | 'critical';
  lineStart?: number;
  lineEnd?: number;
  author: {
    id: string;
    name: string;
    color: string;
  };
  createdAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'applied';
  appliedAt?: Date;
}

interface CodeSuggestionProps {
  suggestions: CodeSuggestion[];
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
  onApply?: (suggestionId: string) => void;
  onEdit?: (suggestionId: string, code: string) => void;
  currentUser: {
    id: string;
    name: string;
  };
  readOnly?: boolean;
}

const TYPE_CONFIG = {
  improvement: {
    icon: Lightbulb,
    label: 'Improvement',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  bug_fix: {
    icon: AlertTriangle,
    label: 'Bug Fix',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  optimization: {
    icon: Code,
    label: 'Optimization',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  style: {
    icon: FileText,
    label: 'Style',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
};

const SEVERITY_CONFIG = {
  low: {
    label: 'Low',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  high: {
    label: 'High',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  critical: {
    label: 'Critical',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'text-yellow-400',
  },
  accepted: {
    icon: CheckCircle,
    label: 'Accepted',
    color: 'text-green-400',
  },
  rejected: {
    icon: XCircle,
    label: 'Rejected',
    color: 'text-red-400',
  },
  applied: {
    icon: CheckCircle,
    label: 'Applied',
    color: 'text-blue-400',
  },
};

export default function CodeSuggestion({
  suggestions,
  onAccept,
  onReject,
  onApply,
  onEdit,
  currentUser,
  readOnly = false,
}: CodeSuggestionProps) {
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<string | null>(null);
  const [editedCode, setEditedCode] = useState('');

  const handleEditorMount = (editor: any, monaco: any) => {
    monaco.editor.defineTheme('suggestion-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'F87171', fontStyle: 'bold' },
        { token: 'string', foreground: '34D399' },
        { token: 'number', foreground: 'FBBF24' },
      ],
      colors: {
        'editor.background': '#09090b',
        'editor.lineHighlightBackground': '#111827',
        'editorCursor.foreground': '#f87171',
        'editorGutter.background': '#09090b',
        'editorOverviewRuler.border': '#27272a',
      },
    });

    monaco.editor.setTheme('suggestion-theme');
  };

  const handleAccept = (suggestionId: string) => {
    if (!readOnly && onAccept) {
      onAccept(suggestionId);
    }
  };

  const handleReject = (suggestionId: string) => {
    if (!readOnly && onReject) {
      onReject(suggestionId);
    }
  };

  const handleApply = (suggestionId: string) => {
    if (!readOnly && onApply) {
      onApply(suggestionId);
    }
  };

  const handleEdit = (suggestion: CodeSuggestion) => {
    if (!readOnly && onEdit) {
      setEditingSuggestion(suggestion.id);
      setEditedCode(suggestion.suggestedCode);
    }
  };

  const handleSaveEdit = (suggestionId: string) => {
    if (onEdit) {
      onEdit(suggestionId, editedCode);
      setEditingSuggestion(null);
      setEditedCode('');
    }
  };

  const handleCancelEdit = () => {
    setEditingSuggestion(null);
    setEditedCode('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadDiff = (suggestion: CodeSuggestion) => {
    const diff = `// Suggestion: ${suggestion.title}
// Author: ${suggestion.author.name}
// Type: ${TYPE_CONFIG[suggestion.type].label}
// Severity: ${SEVERITY_CONFIG[suggestion.severity].label}
// Created: ${suggestion.createdAt.toLocaleDateString()}

// Original Code:
${suggestion.originalCode}

// Suggested Code:
${suggestion.suggestedCode}`;

    const blob = new Blob([diff], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suggestion-${suggestion.id}.diff`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatLineRange = (lineStart?: number, lineEnd?: number) => {
    if (!lineStart) return '';
    if (!lineEnd) return `Line ${lineStart}`;
    return lineStart === lineEnd ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Code Suggestions</h3>
          <p className="mt-1 text-sm text-gray-400">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 transition-colors hover:text-white">
            <Copy className="h-4 w-4" />
          </button>
          <button className="p-2 text-gray-400 transition-colors hover:text-white">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <Lightbulb className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>No code suggestions yet</p>
          <p className="mt-2 text-sm">
            Suggestions will appear here when reviewers propose improvements
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const typeConfig = TYPE_CONFIG[suggestion.type];
            const severityConfig = SEVERITY_CONFIG[suggestion.severity];
            const statusConfig = STATUS_CONFIG[suggestion.status];
            const isExpanded = expandedSuggestion === suggestion.id;
            const isShowingDiff = showDiff === suggestion.id;
            const isEditing = editingSuggestion === suggestion.id;

            return (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-4 ${typeConfig.bgColor} ${typeConfig.borderColor} ${
                  isExpanded ? 'ring-2 ring-white/10' : ''
                }`}
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center space-x-3">
                      <div className={`rounded-lg p-2 ${typeConfig.bgColor}`}>
                        {React.createElement(typeConfig.icon, {
                          className: `w-4 h-4 ${typeConfig.color}`,
                        })}
                      </div>

                      <div>
                        <h4 className="font-medium text-white">{suggestion.title}</h4>
                        <div className="mt-1 flex items-center space-x-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${typeConfig.bgColor} ${typeConfig.color}`}
                          >
                            {typeConfig.label}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${severityConfig.bgColor} ${severityConfig.color}`}
                          >
                            {severityConfig.label}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${statusConfig.color} flex items-center space-x-1`}
                          >
                            {React.createElement(statusConfig.icon, { className: 'w-3 h-3' })}
                            <span>{statusConfig.label}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-gray-300">{suggestion.description}</p>
                  </div>

                  <div className="ml-4 flex items-center space-x-2">
                    <div className="text-right text-xs text-gray-400">
                      <p>{suggestion.author.name}</p>
                      <p>{suggestion.createdAt.toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {/* Line Range */}
                {suggestion.lineStart && (
                  <div className="mb-3 flex items-center space-x-2">
                    <GitBranch className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {formatLineRange(suggestion.lineStart, suggestion.lineEnd)}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setExpandedSuggestion(isExpanded ? null : suggestion.id)}
                      className="rounded bg-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/20"
                    >
                      {isExpanded ? (
                        <>
                          <EyeOff className="mr-1 inline h-3 w-3" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <Eye className="mr-1 inline h-3 w-3" />
                          View Details
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setShowDiff(isShowingDiff ? null : suggestion.id)}
                      className="rounded bg-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/20"
                    >
                      {isShowingDiff ? 'Hide Diff' : 'Show Diff'}
                    </button>

                    <button
                      onClick={() => downloadDiff(suggestion)}
                      className="p-1 text-xs text-gray-400 transition-colors hover:text-white"
                      title="Download diff"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>

                  {!readOnly && suggestion.status === 'pending' && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(suggestion)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleAccept(suggestion.id)}
                        className="rounded bg-green-600 px-3 py-1 text-xs text-white transition-colors hover:bg-green-500"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(suggestion.id)}
                        className="rounded bg-red-600 px-3 py-1 text-xs text-white transition-colors hover:bg-red-500"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {!readOnly && suggestion.status === 'accepted' && (
                    <button
                      onClick={() => handleApply(suggestion.id)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-500"
                    >
                      Apply
                    </button>
                  )}
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      {/* Original Code */}
                      <div>
                        <h5 className="mb-2 text-sm font-medium text-white">Original Code</h5>
                        <div className="rounded-lg border border-white/10 bg-black/50 p-3">
                          <pre className="overflow-x-auto font-mono text-sm text-gray-300">
                            {suggestion.originalCode}
                          </pre>
                        </div>
                      </div>

                      {/* Suggested Code */}
                      <div>
                        <h5 className="mb-2 text-sm font-medium text-white">Suggested Code</h5>
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editedCode}
                              onChange={(e) => setEditedCode(e.target.value)}
                              className="w-full resize-none rounded-lg border border-white/20 bg-black/50 p-3 font-mono text-sm text-white focus:border-red-500/60 focus:outline-none"
                              rows={8}
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleSaveEdit(suggestion.id)}
                                className="rounded bg-green-600 px-3 py-1 text-xs text-white transition-colors hover:bg-green-500"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="rounded bg-gray-600 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-white/10 bg-black/50 p-3">
                            <pre className="overflow-x-auto font-mono text-sm text-gray-300">
                              {suggestion.suggestedCode}
                            </pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Diff View */}
                <AnimatePresence>
                  {isShowingDiff && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4"
                    >
                      <h5 className="mb-2 text-sm font-medium text-white">Diff View</h5>
                      <div className="h-96 overflow-hidden rounded-lg border border-white/10">
                        <DiffEditor
                          original={suggestion.originalCode}
                          modified={isEditing ? editedCode : suggestion.suggestedCode}
                          language={suggestion.language}
                          theme="suggestion-theme"
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            renderSideBySide: false,
                            renderOverviewRuler: false,
                          }}
                          onMount={handleEditorMount}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
