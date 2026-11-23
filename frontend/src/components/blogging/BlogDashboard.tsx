'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  ChevronRight,
  DollarSign,
  Heart,
  Lock,
  MessageSquare,
  PenTool,
  Plus,
  Shield,
  TrendingUp,
} from 'lucide-react';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  readTime: string;
  isPaid: boolean;
  price: string;
  likes: number;
  comments: number;
  tags: string[];
}

const mockPosts: BlogPost[] = [
  {
    id: 1,
    title: 'The Future of Soroban Smart Contracts',
    excerpt:
      'Exploring the next generation of WASM-based smart contracts on the Stellar network...',
    author: 'StellarDev',
    date: 'Oct 24, 2026',
    readTime: '8 min read',
    isPaid: false,
    price: '0',
    likes: 124,
    comments: 18,
    tags: ['WASM', 'Stellar', 'Rust'],
  },
  {
    id: 2,
    title: 'Monetizing Open Source via On-Chain Tips',
    excerpt:
      'How direct tipping mechanisms are revolutionizing the way developers fund their work...',
    author: 'OpenSourceGal',
    date: 'Oct 22, 2026',
    readTime: '12 min read',
    isPaid: true,
    price: '50 RST',
    likes: 89,
    comments: 24,
    tags: ['Economics', 'Blogging', 'Web3'],
  },
  {
    id: 3,
    title: 'Advanced Merkle Tree Optimizations',
    excerpt:
      'Deep dive into gas-efficient merkle proof verification techniques for large-scale distributions...',
    author: 'CryptoWizard',
    date: 'Oct 20, 2026',
    readTime: '15 min read',
    isPaid: true,
    price: '100 RST',
    likes: 245,
    comments: 42,
    tags: ['Cryptography', 'Performance'],
  },
];

export const BlogDashboard: React.FC = () => {
  const [view, setView] = useState<'feed' | 'editor' | 'analytics'>('feed');
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      <aside className="fixed top-0 left-0 z-50 flex h-full w-20 flex-col items-center gap-10 border-r border-white/5 bg-zinc-950 py-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.3)]">
          <Shield className="h-6 w-6" />
        </div>

        <nav className="flex flex-col gap-6">
          <NavIcon
            icon={<BookOpen />}
            active={view === 'feed'}
            onClick={() => setView('feed')}
            label="Read"
          />
          <NavIcon
            icon={<PenTool />}
            active={view === 'editor'}
            onClick={() => setView('editor')}
            label="Write"
          />
          <NavIcon
            icon={<TrendingUp />}
            active={view === 'analytics'}
            onClick={() => setView('analytics')}
            label="Stats"
          />
        </nav>

        <div className="mt-auto">
          <div className="h-10 w-10 rounded-full border border-white/10 bg-gradient-to-br from-red-500 to-zinc-800" />
        </div>
      </aside>

      <main className="min-h-screen pl-20">
        <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-white/5 bg-black/50 px-12 backdrop-blur-xl">
          <h2 className="text-xl font-black tracking-[0.3em] uppercase">
            Protocol <span className="text-red-600">Journal</span>
          </h2>
          <button className="rounded-lg bg-red-600 px-6 py-2 text-xs font-black tracking-widest uppercase transition-all hover:bg-red-700">
            Connect Wallet
          </button>
        </header>

        <div className="mx-auto max-w-5xl p-12">
          <AnimatePresence mode="wait">
            {view === 'feed' && (
              <motion.div
                key="feed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="mb-2 text-5xl font-black tracking-tighter italic">
                      Intelligence Feed
                    </h1>
                    <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                      Encrypted decentralized content streams
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {['Trending', 'Latest', 'Curated'].map((filter) => (
                      <button
                        key={filter}
                        className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all hover:border-red-500"
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-8">
                  {mockPosts.map((post) => (
                    <PostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'editor' && (
              <motion.div
                key="editor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-3xl"
              >
                <div className="mb-12 border-l-2 border-red-600 pl-6">
                  <h1 className="mb-2 text-4xl font-black tracking-tight uppercase">
                    New Transmission
                  </h1>
                  <p className="text-xs tracking-widest text-gray-500 uppercase">
                    Mint your thoughts to the immutable ledger
                  </p>
                </div>

                <div className="space-y-8">
                  <input
                    type="text"
                    placeholder="ARTICLE TITLE"
                    className="w-full border-b border-white/10 bg-transparent py-4 text-3xl font-black tracking-tighter uppercase transition-all outline-none focus:border-red-600"
                  />
                  <div className="flex gap-4">
                    <button className="flex items-center gap-2 rounded-md border border-white/10 bg-zinc-900 px-4 py-2 text-[10px] font-bold uppercase">
                      <Plus className="h-3 w-3" /> Add Tag
                    </button>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-white/10 bg-zinc-900 px-4 py-2">
                      <input type="checkbox" className="accent-red-600" />
                      <span className="text-[10px] font-bold uppercase">Paid Content</span>
                    </label>
                  </div>
                  <textarea
                    placeholder="BEGIN TRANSMISSION..."
                    className="min-h-[400px] w-full rounded-2xl border border-white/5 bg-zinc-950 p-8 font-mono text-gray-400 transition-all outline-none focus:border-red-600"
                  />
                </div>
              </motion.div>
            )}

            {view === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-6 md:grid-cols-3"
              >
                {[
                  { label: 'Articles', value: '128' },
                  { label: 'Tips Earned', value: '1,420 RST' },
                  { label: 'Subscribers', value: '342' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-3xl border border-white/5 bg-zinc-950 p-8"
                  >
                    <p className="text-[10px] font-black tracking-widest text-gray-500 uppercase">
                      {stat.label}
                    </p>
                    <p className="mt-4 text-3xl font-black">{stat.value}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex justify-end bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-zinc-950 p-12"
            >
              <button
                onClick={() => setSelectedPost(null)}
                className="mb-12 flex items-center gap-2 text-xs font-black tracking-widest text-gray-500 uppercase transition-all hover:text-white"
              >
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to Feed
              </button>

              {selectedPost.isPaid ? (
                <div className="rounded-3xl border border-dashed border-white/5 bg-zinc-900/50 py-20 text-center">
                  <Lock className="mx-auto mb-6 h-16 w-16 text-red-600" />
                  <h2 className="mb-4 text-2xl font-black tracking-tight uppercase">
                    Access Restricted
                  </h2>
                  <p className="mx-auto mb-8 max-w-sm font-light text-gray-500">
                    This intellectual property is protected by a smart contract seal. Unlock to view
                    content.
                  </p>
                  <button className="rounded-xl bg-red-600 px-10 py-4 text-sm font-black tracking-widest uppercase transition-all hover:scale-105 active:scale-95">
                    Unlock for {selectedPost.price}
                  </button>
                </div>
              ) : (
                <article className="prose prose-invert max-w-none">
                  <div className="mb-6 flex gap-2">
                    {selectedPost.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-red-500/20 bg-red-600/10 px-3 py-1 text-[10px] font-black text-red-500 uppercase"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="mb-4 text-4xl leading-none font-black tracking-tighter uppercase">
                    {selectedPost.title}
                  </h1>
                  <div className="mb-12 flex items-center gap-4 text-xs font-bold tracking-widest text-gray-500 uppercase">
                    <span>{selectedPost.author}</span>
                    <span>•</span>
                    <span>{selectedPost.date}</span>
                    <span>•</span>
                    <span>{selectedPost.readTime}</span>
                  </div>
                  <p className="mb-8 text-lg leading-relaxed text-gray-300 italic">
                    {selectedPost.excerpt}
                  </p>
                  <div className="space-y-6 leading-loose font-light text-gray-400">
                    <p>
                      Soroban represents a fundamental shift in how we think about smart contract
                      execution on public ledgers. By leveraging WebAssembly, it provides a
                      high-performance environment that is both gas-efficient and
                      developer-friendly.
                    </p>
                    <p>
                      Unlike EVM-based chains, Soroban&apos;s resource management is explicit,
                      allowing for predictable costs and sub-second confirmation times.
                    </p>
                  </div>
                  <div className="mt-20 flex items-center justify-between border-t border-white/5 pt-12">
                    <div className="flex gap-6">
                      <button className="flex items-center gap-2 text-gray-400 transition-colors hover:text-red-500">
                        <Heart className="h-5 w-5" />
                        <span className="text-xs font-bold">{selectedPost.likes}</span>
                      </button>
                      <button className="flex items-center gap-2 text-gray-400 transition-colors hover:text-white">
                        <MessageSquare className="h-5 w-5" />
                        <span className="text-xs font-bold">{selectedPost.comments}</span>
                      </button>
                    </div>
                    <button className="group flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-6 py-3 text-[10px] font-black tracking-widest uppercase transition-all hover:border-red-500">
                      <DollarSign className="h-4 w-4 text-green-500 transition-transform group-hover:scale-110" />
                      Send Tip
                    </button>
                  </div>
                </article>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavIcon: React.FC<{
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}> = ({ icon, active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`group relative flex h-12 w-12 flex-col items-center justify-center rounded-xl transition-all ${
      active ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-zinc-900 hover:text-white'
    }`}
  >
    {icon}
    <span className="pointer-events-none absolute left-16 rounded bg-red-600 px-2 py-1 text-[10px] font-black tracking-widest whitespace-nowrap text-white uppercase opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </span>
  </button>
);

const PostCard: React.FC<{ post: BlogPost; onClick: () => void }> = ({ post, onClick }) => (
  <motion.div
    whileHover={{ x: 10 }}
    onClick={onClick}
    className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/5 bg-zinc-950 p-8 transition-all hover:border-red-600/30"
  >
    <div className="absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-red-600/5 opacity-0 transition-opacity group-hover:opacity-100" />
    <div className="mb-4 flex items-start justify-between">
      <div className="flex gap-2">
        {post.tags.map((tag) => (
          <span key={tag} className="text-[9px] font-black tracking-widest text-gray-500 uppercase">
            {tag}
          </span>
        ))}
      </div>
      {post.isPaid && (
        <span className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-[9px] font-black tracking-widest text-green-500 uppercase">
          <Lock className="h-2.5 w-2.5" /> Premium Content
        </span>
      )}
    </div>
    <h3 className="mb-3 text-2xl leading-none font-black tracking-tighter uppercase transition-colors group-hover:text-red-500">
      {post.title}
    </h3>
    <p className="mb-6 line-clamp-2 text-sm font-light text-gray-500 italic">{post.excerpt}</p>
    <div className="flex items-center justify-between border-t border-white/5 pt-6">
      <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest text-gray-600 uppercase">
        <span>{post.author}</span>
        <span>•</span>
        <span>{post.readTime}</span>
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5 text-gray-500">
          <Heart className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold">{post.likes}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500">
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold">{post.comments}</span>
        </div>
      </div>
    </div>
  </motion.div>
);

export default BlogDashboard;
