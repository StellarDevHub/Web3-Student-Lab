'use client';

import { useState, useEffect } from 'react';

// Mock data for forums and posts
const mockForums = [
  {
    id: '1',
    name: 'General Discussion',
    description: 'Talk about anything related to Web3, blockchain, and decentralized technologies',
    postCount: 124,
    memberCount: 892,
    lastActivity: '2 hours ago',
  },
  {
    id: '2',
    name: 'Soroban Development',
    description: 'Questions and discussions about Soroban smart contracts on Stellar',
    postCount: 87,
    memberCount: 456,
    lastActivity: '4 hours ago',
  },
  {
    id: '3',
    name: 'Stellar Blockchain',
    description: 'Everything about the Stellar network and ecosystem',
    postCount: 65,
    memberCount: 321,
    lastActivity: '1 day ago',
  },
  {
    id: '4',
    name: 'Web3 Learning',
    description: 'Share resources, tips, and learning experiences',
    postCount: 203,
    memberCount: 1245,
    lastActivity: '1 day ago',
  },
  {
    id: '5',
    name: 'Hackathon Projects',
    description: 'Collaborate on hackathon ideas and projects',
    postCount: 42,
    memberCount: 287,
    lastActivity: '2 days ago',
  },
];

const mockPosts = [
  {
    id: '1',
    title: 'Best practices for Soroban contract testing?',
    author: 'Alex Johnson',
    avatar: 'AJ',
    forum: 'Soroban Development',
    date: '3 hours ago',
    replies: 12,
    views: 45,
    likes: 8,
    isPinned: true,
    isAnswered: false,
  },
  {
    id: '2',
    title: 'How to handle cross-chain asset transfers?',
    author: 'Sarah Chen',
    avatar: 'SC',
    forum: 'Stellar Blockchain',
    date: '5 hours ago',
    replies: 7,
    views: 32,
    likes: 5,
    isPinned: false,
    isAnswered: true,
  },
  {
    id: '3',
    title: 'Recommended tools for Web3 development in 2026?',
    author: 'Mike Rodriguez',
    avatar: 'MR',
    forum: 'Web3 Learning',
    date: '1 day ago',
    replies: 18,
    views: 89,
    likes: 15,
    isPinned: false,
    isAnswered: false,
  },
  {
    id: '4',
    title: 'Understanding ledger sequences in Stellar',
    author: 'Emma Wilson',
    avatar: 'EW',
    forum: 'Stellar Blockchain',
    date: '1 day ago',
    replies: 4,
    views: 23,
    likes: 3,
    isPinned: false,
    isAnswered: false,
  },
  {
    id: '5',
    title: 'Getting started with Rust for Soroban contracts',
    author: 'David Kim',
    avatar: 'DK',
    forum: 'Soroban Development',
    date: '2 days ago',
    replies: 22,
    views: 156,
    likes: 19,
    isPinned: false,
    isAnswered: true,
  },
];

export default function ForumPage() {
  const [activeTab, setActiveTab] = useState<'forums' | 'posts'>('forums');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForum, setSelectedForum] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('recent');
  
  // Filter forums based on search query
  const filteredForums = mockForums.filter(forum => 
    forum.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    forum.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Filter posts based on search and forum selection
  const filteredPosts = mockPosts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          post.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesForum = !selectedForum || post.forum === selectedForum;
    return matchesSearch && matchesForum;
  });
  
  // Sort posts
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case 'popular':
        return b.replies - a.replies;
      case 'answered':
        return b.isAnswered ? 1 : 0;
      default:
        return 0;
    }
  });
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-purple-600 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Community Forum</h1>
          <p className="text-red-100 max-w-2xl">
            Connect with fellow students, ask questions, share knowledge, and collaborate on Web3 projects.
            The Web3 Student Lab community is here to help you learn and grow.
          </p>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search and Filters */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search forums and posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-800 border border-gray-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              aria-label="Search forums and posts"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              aria-label="Sort posts"
            >
              <option value="recent">Most Recent</option>
              <option value="popular">Most Popular</option>
              <option value="answered">Answered First</option>
            </select>
            
            <button
              className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors"
              aria-label="Filter forums"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a2 2 0 01-.586 1.414l-6.414 6.414a4 4 0 00-.586 3.414V17l-4 4v-6.586a2 2 0 00-.586-1.414L6.586 7.414A2 2 0 005 6V4z" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="mb-8 border-b border-gray-800">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('forums')}
              className={`pb-4 px-1 font-medium text-sm ${activeTab === 'forums' ? 'border-b-2 border-red-500 text-red-400' : 'text-gray-400 hover:text-white'}`}
            >
              Forums
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`pb-4 px-1 font-medium text-sm ${activeTab === 'posts' ? 'border-b-2 border-red-500 text-red-400' : 'text-gray-400 hover:text-white'}`}
            >
              Posts
            </button>
          </div>
        </div>
        
        {/* Forums Tab */}
        {activeTab === 'forums' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Available Forums</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Create New Forum
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredForums.map((forum) => (
                <div 
                  key={forum.id}
                  className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 hover:border-red-500/30 transition-all cursor-pointer"
                  onClick={() => setSelectedForum(forum.name)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-2 rounded-lg bg-red-600/20 text-red-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.133-1.293-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.133-1.293.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg mb-1">{forum.name}</h3>
                      <p className="text-gray-400 text-sm mb-3">{forum.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>{forum.postCount} posts</span>
                        <span>{forum.memberCount} members</span>
                        <span>{forum.lastActivity}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6">Featured Discussions</h2>
              
              <div className="space-y-4">
                {mockPosts.slice(0, 3).map((post) => (
                  <div key={post.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-red-500/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {post.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">{post.author}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-400">{post.date}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-400">{post.forum}</span>
                          {post.isPinned && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-md">Pinned</span>
                          )}
                          {post.isAnswered && (
                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-md">Answered</span>
                          )}
                        </div>
                        <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span>{post.replies} replies</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>{post.views} views</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            <span>{post.likes} likes</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Latest Discussions</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                New Post
              </button>
            </div>
            
            {sortedPosts.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-600/20 flex items-center justify-center text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">No discussions found</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Try adjusting your search or filter criteria, or create your first discussion to get the conversation started!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedPosts.map((post) => (
                  <div key={post.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-red-500/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {post.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">{post.author}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-400">{post.date}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-400">{post.forum}</span>
                          {post.isPinned && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-md">Pinned</span>
                          )}
                          {post.isAnswered && (
                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-md">Answered</span>
                          )}
                        </div>
                        <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span>{post.replies} replies</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>{post.views} views</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            <span>{post.likes} likes</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 pt-4 border-t border-gray-700">
                          <button className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            Like
                          </button>
                          <button className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Reply
                          </button>
                          <button className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100 2.684m0 0l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100 2.684m0 0l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100 2.684m0 0l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100 2.684m0 0l6.632 3.316m-6.632-6l6.632-3.316" />
                            </svg>
                            Share
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Pagination */}
        <div className="mt-12 flex justify-center">
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button className="px-4 py-2 rounded-lg bg-red-600 text-white">1</button>
            <button className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">2</button>
            <button className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">3</button>
            <button className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
