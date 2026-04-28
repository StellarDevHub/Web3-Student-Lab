"use client";

import React, { useState, useEffect } from 'react';
import Editor, { DiffEditor } from "@monaco-editor/react";
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
  Eye
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

export const SnippetEditor: React.FC<SnippetEditorProps> = ({ 
  snippetId, 
  onBack,
  onSave
}) => {
  const snippetManager = SnippetManager.getInstance();
  const versionControl = VersionControl.getInstance();

  const [snippet, setSnippet] = useState<Partial<Snippet>>({
    title: '',
    content: '',
    language: 'typescript',
    tags: [],
    isPublic: false
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
        versionControl.createVersion(saved.id, saved.content, `Saved on ${new Date().toLocaleString()}`);
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
    setSnippet({ ...snippet, tags: snippet.tags?.filter(t => t !== tagToRemove) });
  };

  const handleRevert = (version: SnippetVersion) => {
    setSnippet({ ...snippet, content: version.content });
    setActiveTab('editor');
    setShowDiff(false);
  };

  const languages = ['typescript', 'javascript', 'rust', 'solidity', 'markdown', 'json', 'python', 'html', 'css'];

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#09090b]">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col flex-1 max-w-md">
            <input 
              type="text" 
              value={snippet.title}
              onChange={(e) => setSnippet({...snippet, title: e.target.value})}
              placeholder="Snippet Title..."
              className="bg-transparent text-xl font-bold border-none outline-none focus:ring-0 placeholder-white/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setSnippet({...snippet, isPublic: !snippet.isPublic})}
          >
            {snippet.isPublic ? <Unlock className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-amber-500" />}
            {snippet.isPublic ? 'Public' : 'Private'}
          </Button>
          
          <Button 
            variant="default" 
            size="sm" 
            className="gap-2 bg-red-600 hover:bg-red-700"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Check className="w-4 h-4 animate-in fade-in" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saved' : 'Save Snippet'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar / Metadata */}
        <div className="w-64 border-r border-white/10 p-4 flex flex-col gap-6 overflow-y-auto bg-[#0c0c0e]">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40 mb-2 block font-bold">Language</label>
            <select 
              value={snippet.language}
              onChange={(e) => setSnippet({...snippet, language: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:border-red-500 transition-colors"
            >
              {languages.map(lang => (
                <option key={lang} value={lang} className="bg-[#09090b]">{lang}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40 mb-2 block font-bold">Tags</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {snippet.tags?.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1 bg-white/5 hover:bg-white/10 border-white/10">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text" 
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tag..."
                className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">History</label>
              <History className="w-3 h-3 text-white/40" />
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-white/20 italic">No history yet</p>
              ) : (
                history.map((v, idx) => (
                  <div 
                    key={v.id} 
                    className={`p-2 rounded-md border text-left transition-all cursor-pointer group ${
                      diffVersion?.id === v.id ? 'border-red-500 bg-red-500/10' : 'border-white/5 hover:border-white/20 bg-white/5'
                    }`}
                    onClick={() => {
                      setDiffVersion(v);
                      setShowDiff(true);
                      setActiveTab('diff');
                    }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-medium text-white/60">v{history.length - idx}</span>
                      <span className="text-[9px] text-white/30">{new Date(v.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[11px] text-white/80 line-clamp-1">{v.message}</p>
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <Button size="icon" variant="ghost" className="h-5 w-5 rounded-full" title="Revert to this version" onClick={(e) => {
                           e.stopPropagation();
                           handleRevert(v);
                       }}>
                         <RotateCcw className="w-3 h-3" />
                       </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col relative">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-4 py-2 bg-[#0c0c0e] border-b border-white/10 flex items-center justify-between">
              <TabsList className="bg-transparent border-none">
                <TabsTrigger value="editor" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">Editor</TabsTrigger>
                {showDiff && <TabsTrigger value="diff" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">Diff View</TabsTrigger>}
              </TabsList>
              
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="font-mono">{snippet.language}</span>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <span>{snippet.content?.split('\n').length} lines</span>
              </div>
            </div>

            <TabsContent value="editor" className="flex-1 mt-0">
               <Editor
                  height="100%"
                  language={snippet.language}
                  value={snippet.content}
                  onChange={(val) => setSnippet({...snippet, content: val || ''})}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 20 },
                    backgroundColor: "#09090b",
                  }}
                  onMount={(editor, monaco) => {
                    monaco.editor.defineTheme("snippet-dark", {
                        base: "vs-dark",
                        inherit: true,
                        rules: [],
                        colors: {
                            "editor.background": "#09090b",
                        }
                    });
                    monaco.editor.setTheme("snippet-dark");
                  }}
                />
            </TabsContent>

            <TabsContent value="diff" className="flex-1 mt-0">
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
                <div className="flex items-center justify-center h-full text-white/20 italic">
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
