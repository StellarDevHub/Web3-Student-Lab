'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Folder,
  Globe,
  User,
  Star,
  Clock,
  MoreVertical,
  Copy,
  Edit3,
  Trash2,
  Filter,
  Code2,
  TrendingUp,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Snippet, SnippetManager } from '../../lib/snippets/SnippetManager';
import { SnippetEditor } from './SnippetEditor';
import { motion, AnimatePresence } from 'framer-motion';

export const SnippetLibrary: React.FC = () => {
  const snippetManager = SnippetManager.getInstance();

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const snippets = useMemo(() => {
    const filters: any = { query: searchQuery };
    if (activeTab === 'personal') {
      // In a real app, filter by user id. Here we show all and assume they are personal for now,
      // or filter by isPublic: false if we want.
    } else if (activeTab === 'community') {
      filters.isPublic = true;
    }

    let list = snippetManager.getSnippets(filters);
    if (selectedTag) {
      list = list.filter((s) => s.tags.includes(selectedTag));
    }
    return list;
  }, [searchQuery, activeTab, selectedTag, view]); // Re-run when view changes to refresh data

  const tags = useMemo(() => snippetManager.getAllTags(), [snippets]);

  const handleCreate = () => {
    setSelectedSnippetId(undefined);
    setView('editor');
  };

  const handleEdit = (id: string) => {
    setSelectedSnippetId(id);
    setView('editor');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this snippet?')) {
      snippetManager.deleteSnippet(id);
      // Force refresh
      setActiveTab((prev) => prev);
    }
  };

  const handleCopy = (content: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    // Could add a toast here
  };

  if (view === 'editor') {
    return <SnippetEditor snippetId={selectedSnippetId} onBack={() => setView('list')} />;
  }

  return (
    <div className="flex h-full bg-[#09090b] text-white">
      {/* Sidebar Navigation */}
      <div className="flex w-64 flex-col gap-8 border-r border-white/10 bg-[#0c0c0e] p-6">
        <div className="flex flex-col gap-2">
          <h1 className="bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-xl font-bold text-transparent">
            Snippet Lab
          </h1>
          <p className="text-[10px] font-medium tracking-widest text-white/40 uppercase">
            Code Repository
          </p>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => {
              setActiveTab('personal');
              setSelectedTag(null);
            }}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${activeTab === 'personal' ? 'bg-red-500/10 text-red-500' : 'text-white/60 hover:bg-white/5'}`}
          >
            <User className="h-4 w-4" />
            Personal Library
          </button>
          <button
            onClick={() => {
              setActiveTab('community');
              setSelectedTag(null);
            }}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${activeTab === 'community' ? 'bg-red-500/10 text-red-500' : 'text-white/60 hover:bg-white/5'}`}
          >
            <Globe className="h-4 w-4" />
            Community Marketplace
          </button>
          <button className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5">
            <Star className="h-4 w-4" />
            Favorites
          </button>
        </nav>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
              Popular Tags
            </span>
            <Filter className="h-3 w-3 text-white/40" />
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-all ${
                  selectedTag === tag
                    ? 'bg-red-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto rounded-xl border border-white/5 bg-gradient-to-br from-red-500/20 to-amber-500/5 p-4">
          <TrendingUp className="mb-2 h-5 w-5 text-red-500" />
          <h3 className="mb-1 text-xs font-bold">Weekly Trends</h3>
          <p className="text-[10px] leading-relaxed text-white/40">
            Most shared snippets this week relate to "Rust Macro" and "Stellar SDK".
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#09090b]/50 p-6 backdrop-blur-xl">
          <div className="relative w-full max-w-md">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Search your snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pr-4 pl-10 text-sm transition-all outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/50"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                onClick={() => setLayout('grid')}
                className={`rounded-md p-1.5 transition-all ${layout === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setLayout('list')}
                className={`rounded-md p-1.5 transition-all ${layout === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="default"
              className="h-10 gap-2 rounded-full bg-red-600 px-6 font-bold shadow-lg shadow-red-600/20 hover:bg-red-700"
              onClick={handleCreate}
            >
              <Plus className="h-4 w-4" />
              New Snippet
            </Button>
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="mb-1 text-2xl font-bold">
                {activeTab === 'personal' ? 'My Snippets' : 'Community Marketplace'}
                {selectedTag && <span className="ml-2 text-white/40"># {selectedTag}</span>}
              </h2>
              <p className="text-sm text-white/40">
                Showing {snippets.length} snippets found in your library.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Clock className="h-3 w-3" />
              Last synced: Just now
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className={
                layout === 'grid'
                  ? 'grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3'
                  : 'flex flex-col gap-4'
              }
            >
              {snippets.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/20">
                  <Code2 className="mb-4 h-12 w-12" />
                  <p className="text-lg font-medium">No snippets found</p>
                  <p className="text-sm">Try a different search or create a new one.</p>
                </div>
              ) : (
                snippets.map((s) => (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className={`group flex h-full cursor-pointer flex-col border-white/10 bg-white/5 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-black/50 ${
                        layout === 'list' ? 'flex-row items-center p-2' : ''
                      }`}
                      onClick={() => handleEdit(s.id)}
                    >
                      <CardHeader className={layout === 'list' ? 'flex-1 p-3' : 'p-5'}>
                        <div className="mb-2 flex items-start justify-between">
                          <Badge
                            variant="outline"
                            className="border-white/10 bg-white/5 text-[10px] font-bold tracking-tight uppercase"
                          >
                            {s.language}
                          </Badge>
                          <div className="flex gap-1">
                            <button
                              className="rounded-full p-1.5 text-white/40 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                              onClick={(e) => handleCopy(s.content, e)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-full p-1.5 text-white/40 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
                              onClick={(e) => handleDelete(s.id, e)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <CardTitle
                          className={`text-lg font-bold transition-colors group-hover:text-red-400 ${layout === 'list' ? 'mb-0' : 'mb-2'}`}
                        >
                          {s.title}
                        </CardTitle>
                        {layout === 'grid' && (
                          <p className="line-clamp-2 rounded border border-white/5 bg-black/20 p-2 font-mono text-xs text-white/40">
                            {s.content.substring(0, 150)}...
                          </p>
                        )}
                      </CardHeader>

                      <div
                        className={`mt-auto flex flex-col gap-4 px-5 pb-5 ${layout === 'list' ? 'hidden' : ''}`}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {s.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[10px] text-white/30">
                              # {tag}
                            </span>
                          ))}
                          {s.tags.length > 3 && (
                            <span className="text-[10px] text-white/30">+{s.tags.length - 3}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-amber-500 text-[8px] font-bold">
                              ST
                            </div>
                            <span className="text-[10px] text-white/40">Student User</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-medium text-white/30">
                            <span className="flex items-center gap-1">
                              <History className="h-3 w-3" /> {s.versionCount || 1}
                            </span>
                            {s.isPublic && <Globe className="h-3 w-3 text-green-500/50" />}
                          </div>
                        </div>
                      </div>

                      {layout === 'list' && (
                        <div className="ml-auto flex items-center gap-6 border-l border-white/5 px-6 py-2">
                          <div className="flex max-w-[200px] flex-wrap gap-2">
                            {s.tags.map((tag) => (
                              <span key={tag} className="text-[10px] text-white/30">
                                #{tag}
                              </span>
                            ))}
                          </div>
                          <span className="flex min-w-[60px] items-center gap-1 text-[10px] font-medium text-white/30">
                            <History className="h-3 w-3" /> {s.versionCount || 1}
                          </span>
                          {s.isPublic ? (
                            <Globe className="h-4 w-4 text-green-500/50" />
                          ) : (
                            <Lock className="h-4 w-4 text-white/10" />
                          )}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
