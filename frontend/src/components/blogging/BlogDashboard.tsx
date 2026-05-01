import React, { useState, useEffect } from 'react';
import { 
  PlusIcon, 
  ChatBubbleLeftIcon, 
  HeartIcon, 
  CurrencyDollarIcon, 
  UserCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';

interface Post {
  id: number;
  author: string;
  title: string;
  content: string;
  timestamp: string;
  views: number;
  likes: number;
  comments: number;
  price?: number;
  isPaid: boolean;
}

const BlogDashboard: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '', price: 0, isPaid: false });
  const [userEarnings, setUserEarnings] = useState({ tips: 0, sales: 0, subs: 0 });

  // Dummy data for initial render
  useEffect(() => {
    const dummyPosts: Post[] = [
      {
        id: 1,
        author: 'GB...XYZ',
        title: 'The Future of Decentralized Content',
        content: 'Blockchain technology is revolutionizing how we create and monetize content...',
        timestamp: '2 hours ago',
        views: 1250,
        likes: 45,
        comments: 12,
        isPaid: false
      },
      {
        id: 2,
        author: 'GA...ABC',
        title: 'Mastering Soroban Smart Contracts',
        content: 'Learn how to build scalable dApps on the Stellar network using Rust...',
        timestamp: '5 hours ago',
        views: 890,
        likes: 32,
        comments: 8,
        price: 5,
        isPaid: true
      }
    ];
    setPosts(dummyPosts);
    setUserEarnings({ tips: 120, sales: 450, subs: 25 });
  }, []);

  const handleCreatePost = () => {
    // Logic to call contract create_post
    console.log('Creating post:', newPost);
    setIsCreating(false);
  };

  const handleTip = (postId: number) => {
    // Logic to call contract tip_creator
    console.log('Tipping for post:', postId);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              Decentralized Blogging
            </h1>
            <p className="text-slate-400 mt-2">Own your content. Earn from your passion.</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors px-6 py-3 rounded-full font-bold shadow-lg shadow-indigo-900/40"
          >
            <PlusIcon className="w-5 h-5" />
            Create Post
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Feed */}
          <main className="lg:col-span-2 space-y-6">
            <div className="flex gap-4 mb-6 text-sm font-medium">
              <button className="px-4 py-2 bg-indigo-600 rounded-full">Latest</button>
              <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors">Trending</button>
              <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors">Following</button>
            </div>

            {posts.map(post => (
              <article key={post.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-indigo-500/50 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center font-bold">
                      {post.author.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{post.author}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" /> {post.timestamp}
                      </p>
                    </div>
                  </div>
                  {post.isPaid && (
                    <span className="bg-amber-500/10 text-amber-500 text-[10px] uppercase font-black px-2 py-1 rounded border border-amber-500/20">
                      Paid Access
                    </span>
                  )}
                </div>

                <h2 className="text-2xl font-bold mb-3 group-hover:translate-x-1 transition-transform">{post.title}</h2>
                <p className="text-slate-400 line-clamp-3 mb-6 leading-relaxed">
                  {post.content}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-6">
                    <button className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 transition-colors">
                      <HeartIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">{post.likes}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-slate-400 hover:text-blue-400 transition-colors">
                      <ChatBubbleLeftIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">{post.comments}</span>
                    </button>
                    <button 
                      onClick={() => handleTip(post.id)}
                      className="flex items-center gap-1.5 text-slate-400 hover:text-green-400 transition-colors"
                    >
                      <CurrencyDollarIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">Tip</span>
                    </button>
                  </div>
                  <button className="flex items-center gap-1 text-indigo-400 font-bold text-sm hover:underline">
                    Read More <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </article>
            ))}
          </main>

          {/* Sidebar */}
          <aside className="space-y-8">
            {/* Creator Dashboard */}
            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-6">
                <ChartBarIcon className="w-6 h-6 text-indigo-400" />
                <h3 className="text-xl font-bold">Creator Stats</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl">
                  <span className="text-slate-400 text-sm">Total Tips</span>
                  <span className="text-green-400 font-mono font-bold">${userEarnings.tips}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl">
                  <span className="text-slate-400 text-sm">Article Sales</span>
                  <span className="text-blue-400 font-mono font-bold">${userEarnings.sales}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl">
                  <span className="text-slate-400 text-sm">Subscriptions</span>
                  <span className="text-purple-400 font-mono font-bold">{userEarnings.subs}</span>
                </div>
                
                {/* Transparency Metric */}
                <div className="pt-4 border-t border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">Earnings Breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/60 p-2 rounded-lg">
                      <p className="text-[10px] text-slate-500">This Week</p>
                      <p className="text-sm font-bold text-slate-200">+$125.40</p>
                    </div>
                    <div className="bg-slate-800/60 p-2 rounded-lg">
                      <p className="text-[10px] text-slate-500">Projected</p>
                      <p className="text-sm font-bold text-indigo-400">+$540.00</p>
                    </div>
                  </div>
                </div>
              </div>
              <button className="w-full mt-6 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-sm transition-colors border border-slate-700">
                View Detailed Analytics
              </button>
            </div>

            {/* Trending Tags */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4">Trending Topics</h3>
              <div className="flex flex-wrap gap-2">
                {['#web3', '#soroban', '#stellar', '#rust', '#dapps', '#future'].map(tag => (
                  <span key={tag} className="bg-slate-800 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-indigo-400 cursor-pointer transition-colors">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Create Post Modal (Simplified) */}
        {isCreating && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Create New Article</h2>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Article Title"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-indigo-500"
                  onChange={(e) => setNewPost({...newPost, title: e.target.value})}
                />
                <textarea 
                  placeholder="Write your content here..."
                  className="w-full h-48 bg-slate-800 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-indigo-500 resize-none"
                  onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      onChange={(e) => setNewPost({...newPost, isPaid: e.target.checked})}
                    />
                    <span className="text-sm font-medium">Set as Paid Content</span>
                  </label>
                  {newPost.isPaid && (
                    <input 
                      type="number" 
                      placeholder="Price (XLM)"
                      className="w-32 bg-slate-800 border border-slate-700 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-500"
                      onChange={(e) => setNewPost({...newPost, price: parseFloat(e.target.value)})}
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreatePost}
                  className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-900/40"
                >
                  Publish Article
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogDashboard;
