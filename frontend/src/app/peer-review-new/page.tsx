'use client';

import { useState } from 'react';
import { Star, MessageSquare, ThumbsUp, Code2, User, Clock } from 'lucide-react';

interface Comment {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
}

interface Submission {
  id: string;
  author: string;
  title: string;
  code: string;
  rating: number;
  ratingCount: number;
  comments: Comment[];
  timestamp: Date;
}

export default function PeerReviewNewPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([
    {
      id: '1',
      author: 'alice.eth',
      title: 'ERC20 Token Implementation',
      code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowances;

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        return true;
    }
}`,
      rating: 4.5,
      ratingCount: 12,
      comments: [
        {
          id: 'c1',
          author: 'bob.eth',
          content: 'Great implementation! Consider adding events for better tracking.',
          timestamp: new Date(Date.now() - 3600000),
        },
      ],
      timestamp: new Date(Date.now() - 7200000),
    },
    {
      id: '2',
      author: 'charlie.sol',
      title: 'NFT Marketplace Contract',
      code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTMarketplace is ERC721 {
    struct Listing {
        uint256 price;
        address seller;
    }

    mapping(uint256 => Listing) public listings;

    function listToken(uint256 tokenId, uint256 price) public {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        listings[tokenId] = Listing(price, msg.sender);
    }
}`,
      rating: 3.8,
      ratingCount: 8,
      comments: [],
      timestamp: new Date(Date.now() - 14400000),
    },
  ]);

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(submissions[0]);
  const [newComment, setNewComment] = useState('');
  const [userRating, setUserRating] = useState(0);

  const handleAddComment = () => {
    if (!selectedSubmission || !newComment.trim()) return;

    const comment: Comment = {
      id: `c${Date.now()}`,
      author: 'current_user.eth',
      content: newComment,
      timestamp: new Date(),
    };

    const updatedSubmissions = submissions.map((sub) =>
      sub.id === selectedSubmission.id
        ? { ...sub, comments: [...sub.comments, comment] }
        : sub
    );

    setSubmissions(updatedSubmissions);
    setSelectedSubmission(
      updatedSubmissions.find((s) => s.id === selectedSubmission.id) || null
    );
    setNewComment('');
  };

  const handleRate = (rating: number) => {
    if (!selectedSubmission) return;

    setUserRating(rating);

    const updatedSubmissions = submissions.map((sub) =>
      sub.id === selectedSubmission.id
        ? {
            ...sub,
            rating: (sub.rating * sub.ratingCount + rating) / (sub.ratingCount + 1),
            ratingCount: sub.ratingCount + 1,
          }
        : sub
    );

    setSubmissions(updatedSubmissions);
    setSelectedSubmission(
      updatedSubmissions.find((s) => s.id === selectedSubmission.id) || null
    );
  };

  const renderStars = (rating: number, interactive = false) => {
    return [1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`h-5 w-5 ${
          star <= Math.round(rating)
            ? 'fill-yellow-500 text-yellow-500'
            : 'text-gray-600'
        } ${interactive ? 'cursor-pointer hover:scale-110 transition' : ''}`}
        onClick={interactive ? () => handleRate(star) : undefined}
      />
    ));
  };

  return (
    <div className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Peer <span className="text-red-500">Review</span> Panel
          </h1>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            Code Evaluation & Feedback System
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Submissions List */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
              Shared Submissions
            </h3>

            <div className="space-y-3">
              {submissions.map((submission) => (
                <button
                  key={submission.id}
                  onClick={() => setSelectedSubmission(submission)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedSubmission?.id === submission.id
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-white/5 bg-black/30 hover:border-white/20'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="text-xs font-bold text-gray-300">
                        {submission.author}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {renderStars(submission.rating)}
                      <span className="ml-2 text-[10px] text-gray-400">
                        ({submission.ratingCount})
                      </span>
                    </div>
                  </div>
                  <div className="mb-2 text-sm font-bold text-white">
                    {submission.title}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <Clock className="h-3 w-3" />
                    {new Date(submission.timestamp).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Code Review Panel */}
          <div className="lg:col-span-2 space-y-6">
            {selectedSubmission && (
              <>
                <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black tracking-widest text-white uppercase">
                        {selectedSubmission.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                        <User className="h-3 w-3" />
                        {selectedSubmission.author}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {renderStars(selectedSubmission.rating)}
                        <span className="ml-2 text-sm font-bold text-white">
                          {selectedSubmission.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-black p-4">
                    <pre className="overflow-x-auto text-xs text-gray-300">
                      <code>{selectedSubmission.code}</code>
                    </pre>
                  </div>
                </div>

                {/* Rating Section */}
                <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
                  <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                    Rate This Code
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(userRating, true)}</div>
                    <span className="text-sm text-gray-400">
                      {userRating > 0 ? `${userRating}/5` : 'Click to rate'}
                    </span>
                  </div>
                </div>

                {/* Comments Section */}
                <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
                  <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                    Comments ({selectedSubmission.comments.length})
                  </h3>

                  <div className="mb-6 space-y-4">
                    {selectedSubmission.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-xl border border-white/5 bg-black/30 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-xs font-bold text-gray-300">
                              {comment.author}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {new Date(comment.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">{comment.content}</p>
                      </div>
                    ))}

                    {selectedSubmission.comments.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
                        <MessageSquare className="mx-auto h-8 w-8 text-gray-600" />
                        <p className="mt-2 text-xs text-gray-500">
                          No comments yet. Be the first to provide feedback!
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Add Comment */}
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write your feedback..."
                      className="w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-3 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
                      rows={3}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Post Comment
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!selectedSubmission && (
              <div className="rounded-3xl border border-white/10 bg-zinc-950 p-12 text-center">
                <Code2 className="mx-auto h-16 w-16 text-gray-600" />
                <h3 className="mt-4 text-sm font-bold text-gray-400">
                  Select a submission to review
                </h3>
                <p className="mt-2 text-xs text-gray-500">
                  Choose from the list of shared code submissions
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
