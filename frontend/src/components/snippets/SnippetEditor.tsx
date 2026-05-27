'use client';

import React, { useState, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
  Save,
  History,
  Share2,
  Lock,
  Unlock,
  Tag,
  Trash2,
  Plus,
  ArrowLeft,
  Check,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Snippet, SnippetManager } from '../../lib/snippets/SnippetManager';
import { VersionControl, SnippetVersion } from '../../lib/snippets/VersionControl';
import { motion, AnimatePresence } from 'framer-motion';

interface SnippetEditorProps {
  snippetId?: string;
  onBack: () => void;
  onSave?: (snippet: Snippet) => void;
}

export const SnippetEditor: React.FC<SnippetEditorProps> = ({ snippetId, onBack, onSave }) => {
  const snippetManager = SnippetManager.getInstance();
  const versionControl = VersionControl.getInstance();

  const [snippet, setSnippet] = useState<Partial<Snippet>>({
    title: '',
    content: '',
    language: 'typescript',
    tags: [],
    isPublic: false,
  });

  const [history, setHistory] = useState<SnippetVersion[]>([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [isSaving, setIsSaving] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [diffVersion, setDiffVersion] = useState<SnippetVersion | null>(null);

  useEffect(() => {
    if (snippetId) {
      const existing = snippetManager.getSnippetById(snippetId);
      if (existing) {
        setSnippet(existing);
        setHistory(versionControl.getHistory(snippetId));
      }
    }
  }, [snippetId]);

  const handleSave = () => {
    setIsSaving(true);
    const saved = snippetManager.saveSnippet(snippet);

    // Create a new version if it's an existing snippet or if content changed significantly
    if (snippetId && snippet.content !== saved.content) {
      versionControl.createVersion(
        saved.id,
        saved.content,
        `Saved on ${new Date().toLocaleString()}`
      );
      setHistory(versionControl.getHistory(saved.id));
    } else if (!snippetId) {
      versionControl.createVersion(saved.id, saved.content, 'Initial version');
      setHistory(versionControl.getHistory(saved.id));
    }

    setSnippet(saved);
    if (onSave) onSave(saved);

    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      if (!snippet.tags?.includes(newTag.trim())) {
        setSnippet({ ...snippet, tags: [...(snippet.tags || []), newTag.trim()] });
      }
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setSnippet({ ...snippet, tags: snippet.tags?.filter((t) => t !== tagToRemove) });
  };

  const handleRevert = (version: SnippetVersion) => {
    setSnippet({ ...snippet, content: version.content });
    setActiveTab('editor');
    setShowDiff(false);
  };

  const languages = [
    'typescript',
    'javascript',
    'rust',
    'solidity',
    'markdown',
    'json',
    'python',
    'html',
    'css',
  ];

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#09090b] p-4">
        <div className="flex flex-1 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex max-w-md flex-1 flex-col">
            <input
              type="text"
              value={snippet.title}
              onChange={(e) => setSnippet({ ...snippet, title: e.target.value })}
              placeholder="Snippet Title..."
              className="border-none bg-transparent text-xl font-bold placeholder-white/20 outline-none focus:ring-0"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSnippet({ ...snippet, isPublic: !snippet.isPublic })}
          >
            {snippet.isPublic ? (
              <Unlock className="h-4 w-4 text-green-500" />
            ) : (
              <Lock className="h-4 w-4 text-amber-500" />
            )}
            {snippet.isPublic ? 'Public' : 'Private'}
          </Button>

          <Button
            variant="default"
            size="sm"
            className="gap-2 bg-red-600 hover:bg-red-700"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Check className="animate-in fade-in h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saved' : 'Save Snippet'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar / Metadata */}
        <div className="flex w-64 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-[#0c0c0e] p-4">
          <div>
            <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/40 uppercase">
              Language
            </label>
            <select
              value={snippet.language}
              onChange={(e) => setSnippet({ ...snippet, language: e.target.value })}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors outline-none focus:border-red-500"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang} className="bg-[#09090b]">
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/40 uppercase">
              Tags
            </label>
            <div className="mb-3 flex flex-wrap gap-2">
              {snippet.tags?.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 border-white/10 bg-white/5 pr-1 hover:bg-white/10"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Tag className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/20" />
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tag..."
                className="w-full rounded-md border border-white/10 bg-white/5 py-2 pr-3 pl-9 text-sm outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
                History
              </label>
              <History className="h-3 w-3 text-white/40" />
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-white/20 italic">No history yet</p>
              ) : (
                history.map((v, idx) => (
                  <div
                    key={v.id}
                    className={`group cursor-pointer rounded-md border p-2 text-left transition-all ${
                      diffVersion?.id === v.id
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-white/5 bg-white/5 hover:border-white/20'
                    }`}
                    onClick={() => {
                      setDiffVersion(v);
                      setShowDiff(true);
                      setActiveTab('diff');
                    }}
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <span className="text-[10px] font-medium text-white/60">
                        v{history.length - idx}
                      </span>
                      <span className="text-[9px] text-white/30">
                        {new Date(v.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[11px] text-white/80">{v.message}</p>
                    <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-full"
                        title="Revert to this version"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevert(v);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className="relative flex flex-1 flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#0c0c0e] px-4 py-2">
              <TabsList className="border-none bg-transparent">
                <TabsTrigger
                  value="editor"
                  className="data-[state=active]:bg-white/10 data-[state=active]:text-white"
                >
                  Editor
                </TabsTrigger>
                {showDiff && (
                  <TabsTrigger
                    value="diff"
                    className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400"
                  >
                    Diff View
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="font-mono">{snippet.language}</span>
                <div className="h-1 w-1 rounded-full bg-white/20" />
                <span>{snippet.content?.split('\n').length} lines</span>
              </div>
            </div>

            <TabsContent value="editor" className="mt-0 flex-1">
              <Editor
                height="100%"
                language={snippet.language}
                value={snippet.content}
                onChange={(val) => setSnippet({ ...snippet, content: val || '' })}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 20 },
                  backgroundColor: '#09090b',
                }}
                onMount={(editor, monaco) => {
                  monaco.editor.defineTheme('snippet-dark', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [],
                    colors: {
                      'editor.background': '#09090b',
                    },
                  });
                  monaco.editor.setTheme('snippet-dark');
                }}
              />
            </TabsContent>

            <TabsContent value="diff" className="mt-0 flex-1">
              {diffVersion ? (
                <DiffEditor
                  height="100%"
                  original={diffVersion.content}
                  modified={snippet.content || ''}
                  language={snippet.language}
                  theme="vs-dark"
                  options={{
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    automaticLayout: true,
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/20 italic">
                  Select a version to compare
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
