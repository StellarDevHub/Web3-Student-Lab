"use client";

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
  List
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
        list = list.filter(s => s.tags.includes(selectedTag));
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
        setActiveTab(prev => prev);
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
      <div className="w-64 border-r border-white/10 p-6 flex flex-col gap-8 bg-[#0c0c0e]">
        <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent">Snippet Lab</h1>
            <p className="text-[10px] text-white/40 font-medium tracking-widest uppercase">Code Repository</p>
        </div>

        <nav className="flex flex-col gap-2">
           <button 
            onClick={() => {setActiveTab('personal'); setSelectedTag(null);}}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'personal' ? 'bg-red-500/10 text-red-500' : 'text-white/60 hover:bg-white/5'}`}
           >
             <User className="w-4 h-4" />
             Personal Library
           </button>
           <button 
            onClick={() => {setActiveTab('community'); setSelectedTag(null);}}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'community' ? 'bg-red-500/10 text-red-500' : 'text-white/60 hover:bg-white/5'}`}
           >
             <Globe className="w-4 h-4" />
             Community Marketplace
           </button>
           <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5">
             <Star className="w-4 h-4" />
             Favorites
           </button>
        </nav>

        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Popular Tags</span>
                <Filter className="w-3 h-3 text-white/40" />
            </div>
            <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                    <button 
                        key={tag}
                        onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
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

        <div className="mt-auto p-4 rounded-xl bg-gradient-to-br from-red-500/20 to-amber-500/5 border border-white/5">
            <TrendingUp className="w-5 h-5 text-red-500 mb-2" />
            <h3 className="text-xs font-bold mb-1">Weekly Trends</h3>
            <p className="text-[10px] text-white/40 leading-relaxed">Most shared snippets this week relate to "Rust Macro" and "Stellar SDK".</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="p-6 border-b border-white/10 flex items-center justify-between bg-[#09090b]/50 backdrop-blur-xl sticky top-0 z-10">
            <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                    type="text" 
                    placeholder="Search your snippets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
                />
            </div>

            <div className="flex items-center gap-4">
                <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                    <button 
                        onClick={() => setLayout('grid')}
                        className={`p-1.5 rounded-md transition-all ${layout === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setLayout('list')}
                        className={`p-1.5 rounded-md transition-all ${layout === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
                <Button variant="default" className="gap-2 bg-red-600 hover:bg-red-700 h-10 px-6 rounded-full font-bold shadow-lg shadow-red-600/20" onClick={handleCreate}>
                    <Plus className="w-4 h-4" />
                    New Snippet
                </Button>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold mb-1">
                        {activeTab === 'personal' ? 'My Snippets' : 'Community Marketplace'}
                        {selectedTag && <span className="text-white/40 ml-2"># {selectedTag}</span>}
                    </h2>
                    <p className="text-sm text-white/40">Showing {snippets.length} snippets found in your library.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                    <Clock className="w-3 h-3" />
                    Last synced: Just now
                </div>
            </div>

            <AnimatePresence mode="popLayout">
                <motion.div 
                    layout
                    className={layout === 'grid' 
                        ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
                        : "flex flex-col gap-4"
                    }
                >
                    {snippets.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/20">
                            <Code2 className="w-12 h-12 mb-4" />
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
                                    className={`group border-white/10 bg-white/5 hover:bg-white/[0.07] transition-all hover:border-white/20 hover:shadow-2xl hover:shadow-black/50 cursor-pointer h-full flex flex-col ${
                                        layout === 'list' ? 'flex-row items-center p-2' : ''
                                    }`}
                                    onClick={() => handleEdit(s.id)}
                                >
                                    <CardHeader className={layout === 'list' ? 'p-3 flex-1' : 'p-5'}>
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant="outline" className="bg-white/5 border-white/10 text-[10px] uppercase font-bold tracking-tight">
                                                {s.language}
                                            </Badge>
                                            <div className="flex gap-1">
                                                <button 
                                                    className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                    onClick={(e) => handleCopy(s.content, e)}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    className="p-1.5 rounded-full hover:bg-red-500/10 text-white/40 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                    onClick={(e) => handleDelete(s.id, e)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <CardTitle className={`text-lg font-bold group-hover:text-red-400 transition-colors ${layout === 'list' ? 'mb-0' : 'mb-2'}`}>
                                            {s.title}
                                        </CardTitle>
                                        {layout === 'grid' && (
                                            <p className="text-xs text-white/40 line-clamp-2 font-mono bg-black/20 p-2 rounded border border-white/5">
                                                {s.content.substring(0, 150)}...
                                            </p>
                                        )}
                                    </CardHeader>
                                    
                                    <div className={`px-5 pb-5 mt-auto flex flex-col gap-4 ${layout === 'list' ? 'hidden' : ''}`}>
                                        <div className="flex flex-wrap gap-1.5">
                                            {s.tags.slice(0, 3).map(tag => (
                                                <span key={tag} className="text-[10px] text-white/30"># {tag}</span>
                                            ))}
                                            {s.tags.length > 3 && <span className="text-[10px] text-white/30">+{s.tags.length - 3}</span>}
                                        </div>
                                        
                                        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-[8px] font-bold">
                                                    ST
                                                </div>
                                                <span className="text-[10px] text-white/40">Student User</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-white/30 font-medium">
                                                <span className="flex items-center gap-1"><History className="w-3 h-3" /> {s.versionCount || 1}</span>
                                                {s.isPublic && <Globe className="w-3 h-3 text-green-500/50" />}
                                            </div>
                                        </div>
                                    </div>

                                    {layout === 'list' && (
                                        <div className="flex items-center gap-6 px-6 py-2 border-l border-white/5 ml-auto">
                                            <div className="flex flex-wrap gap-2 max-w-[200px]">
                                                {s.tags.map(tag => (
                                                    <span key={tag} className="text-[10px] text-white/30">#{tag}</span>
                                                ))}
                                            </div>
                                            <span className="text-[10px] text-white/30 font-medium flex items-center gap-1 min-w-[60px]">
                                                <History className="w-3 h-3" /> {s.versionCount || 1}
                                            </span>
                                            {s.isPublic ? <Globe className="w-4 h-4 text-green-500/50" /> : <Lock className="w-4 h-4 text-white/10" />}
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
