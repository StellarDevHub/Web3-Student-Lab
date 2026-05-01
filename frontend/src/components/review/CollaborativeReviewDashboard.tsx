"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    BarChart3,
    Code,
    FileText,
    Settings,
    Target,
    Users,
    X
} from "lucide-react";
import { useState } from "react";

// Import our new collaborative components
import CodeReview from "./CodeReview";
import CodeSuggestion from "./CodeSuggestion";
import CollaborativeCursors from "./CollaborativeCursors";
import MentionsNotifications from "./MentionsNotifications";
import PresenceIndicators from "./PresenceIndicators";
import ReviewRequest from "./ReviewRequest";
import ReviewStatusIndicators from "./ReviewStatusIndicators";
import ReviewSummaryDashboard from "./ReviewSummaryDashboard";
import ReviewTemplates from "./ReviewTemplates";
import ReviewWorkflow from "./ReviewWorkflow";

// Import our review management system
import { useCommentSync } from "../../lib/review/CommentSync";
import { ReviewManager } from "../../lib/review/ReviewManager";

const currentCode = `use soroban_sdk::{contractimpl, Env, Symbol};

pub struct StudentContract;

#[contractimpl]
impl StudentContract {
    pub fn grade_submission(env: Env, score: i32) -> i32 {
        env.log(&Symbol::new("grading"));
        let adjusted = score * 2;

        if adjusted > 100 {
            panic!("Score exceeds allowed maximum");
        }

        adjusted
    }

    pub fn submit_code(env: Env, code: String) -> bool {
        if code.is_empty() {
            return false;
        }

        env.storage().set(&Symbol::new("last_submission"), &code);
        true
    }
}
`;

const masterCode = `use soroban_sdk::{contractimpl, Env, Symbol};

pub struct StudentContract;

#[contractimpl]
impl StudentContract {
    pub fn grade_submission(env: Env, score: i32) -> i32 {
        let adjusted = score.checked_mul(2).unwrap_or(0);

        if adjusted > 100 {
            return 100;
        }

        adjusted
    }

    pub fn submit_code(env: Env, code: String) -> bool {
        if code.trim().is_empty() {
            return false;
        }

        env.storage().set(&Symbol::new("last_submission"), &code);
        true
    }
}
`;

interface CollaborativeReviewDashboardProps {
  roomId?: string;
  currentUser?: {
    id: string;
    name: string;
    email?: string;
    color: string;
  };
}

export default function CollaborativeReviewDashboard({
  roomId = "review-room-1",
  currentUser = {
    id: "current-user",
    name: "Current User",
    email: "user@example.com",
    color: "#f87171",
  },
}: CollaborativeReviewDashboardProps) {
  const [activeTab, setActiveTab] = useState<"code" | "requests" | "workflow" | "analytics" | "templates">("code");
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reviewManager] = useState(() => new ReviewManager());

  // Initialize real-time collaboration
  const {
    sync,
    isConnected,
    connectedUsers,
    addComment,
    updateComment,
    deleteComment,
    addReply
  } = useCommentSync(roomId, currentUser);

  // Mock current review data
  const [currentReview] = useState({
    id: "review-1",
    title: "Authentication Module Review",
    description: "Review of updated authentication implementation",
    author: currentUser,
    reviewers: [
      { id: "reviewer-1", name: "Jane Smith", email: "jane@example.com" },
      { id: "reviewer-2", name: "Bob Johnson", email: "bob@example.com" },
    ],
    code: currentCode,
    language: "rust",
    status: "in_review" as const,
    createdAt: new Date("2023-01-15"),
    updatedAt: new Date("2023-01-15"),
    dueDate: new Date("2023-01-20"),
    tags: ["security", "authentication", "high-priority"],
    priority: "high" as const,
  });

  const tabs = [
    { id: "code", label: "Code Review", icon: Code },
    { id: "requests", label: "Review Requests", icon: FileText },
    { id: "workflow", label: "Review Workflow", icon: Target },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "templates", label: "Templates", icon: Settings },
  ];

  const handleReviewSelect = (review: any) => {
    setSelectedReview(review);
    setActiveTab("workflow");
  };

  const handleRequestCreate = (review: any) => {
    console.log("New review request created:", review);
    // In real app, this would update the review manager
  };

  const handleReviewComplete = (summary: any) => {
    console.log("Review completed:", summary);
    // In real app, this would update the review status
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white">Collaborative Code Review</h1>

              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
                <span className="text-sm text-gray-400">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>

              {/* Active Users */}
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">
                  {connectedUsers.length} online
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <MentionsNotifications
                currentUser={currentUser}
                onNotificationClick={(notification) => {
                  console.log("Notification clicked:", notification);
                }}
                onMentionClick={(mention) => {
                  console.log("Mention clicked:", mention);
                }}
              />

              {/* Settings */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-white/10 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? "text-white border-red-500"
                      : "text-gray-400 border-transparent hover:text-white hover:border-white/20"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AnimatePresence mode="wait">
          {/* Code Review Tab */}
          {activeTab === "code" && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Review Status */}
              <ReviewStatusIndicators
                review={currentReview}
                reviewManager={reviewManager}
                currentUser={currentUser}
                compact={false}
              />

              {/* Code Editor with Real-time Features */}
              <div className="relative">
                <CodeReview
                  code={currentCode}
                  language="rust"
                  roomId={roomId}
                  height="600px"
                  readOnly={false}
                  currentUser={currentUser}
                  onCodeChange={(code) => {
                    console.log("Code changed:", code);
                    // Handle real-time code sync
                  }}
                />

                {/* Collaborative Cursors Overlay */}
                {sync && (
                  <div className="absolute top-4 right-4">
                    <CollaborativeCursors
                      editor={null} // Would be passed from CodeReview component
                      monaco={null}
                      users={connectedUsers}
                      currentUser={currentUser}
                      onUserCursorUpdate={(userId, position) => {
                        sync?.updateCursor(position);
                      }}
                      onUserSelectionUpdate={(userId, selection) => {
                        sync?.updateSelection(selection);
                      }}
                    />
                  </div>
                )}

                {/* Presence Indicators */}
                <PresenceIndicators
                  users={connectedUsers}
                  currentUser={currentUser}
                  showUserDetails={true}
                  position="top-right"
                />
              </div>

              {/* Code Suggestions */}
              <CodeSuggestion
                suggestions={[
                  {
                    id: "suggestion-1",
                    title: "Use checked multiplication",
                    description: "Replace score * 2 with score.checked_mul(2) to prevent overflow",
                    originalCode: "let adjusted = score * 2;",
                    suggestedCode: "let adjusted = score.checked_mul(2).unwrap_or(0);",
                    language: "rust",
                    type: "bug_fix",
                    severity: "high",
                    lineStart: 6,
                    lineEnd: 6,
                    author: { id: "reviewer-1", name: "Jane Smith", color: "#ff0000" },
                    createdAt: new Date(),
                    status: "pending",
                  },
                ]}
                onAccept={(id) => console.log("Suggestion accepted:", id)}
                onReject={(id) => console.log("Suggestion rejected:", id)}
                onApply={(id) => console.log("Suggestion applied:", id)}
                currentUser={currentUser}
                readOnly={false}
              />
            </motion.div>
          )}

          {/* Review Requests Tab */}
          {activeTab === "requests" && (
            <motion.div
              key="requests"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReviewRequest
                reviewManager={reviewManager}
                currentUser={currentUser}
                onRequestSelect={handleReviewSelect}
                onCreateRequest={handleRequestCreate}
              />
            </motion.div>
          )}

          {/* Review Workflow Tab */}
          {activeTab === "workflow" && (
            <motion.div
              key="workflow"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {selectedReview ? (
                <ReviewWorkflow
                  review={selectedReview}
                  reviewManager={reviewManager}
                  currentUser={currentUser}
                  onReviewComplete={handleReviewComplete}
                  onReviewUpdate={(summary) => console.log("Review updated:", summary)}
                />
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No Review Selected</p>
                  <p className="text-sm">Select a review from the Review Requests tab to start reviewing</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Analytics Tab */}
          {activeTab === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReviewSummaryDashboard
                reviewManager={reviewManager}
                timeRange="30d"
              />
            </motion.div>
          )}

          {/* Templates Tab */}
          {activeTab === "templates" && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReviewTemplates
                reviewManager={reviewManager}
                currentUser={currentUser}
                onSelectTemplate={(template) => {
                  console.log("Template selected:", template);
                }}
                onCreateTemplate={(template) => {
                  console.log("Template created:", template);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-zinc-950 border border-white/20 rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Review Settings</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Room ID
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    readOnly
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    User Name
                  </label>
                  <input
                    type="text"
                    value={currentUser.name}
                    readOnly
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Connection Status
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-sm text-gray-400">
                      {isConnected ? "Connected to collaboration server" : "Disconnected"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Active Collaborators
                  </label>
                  <div className="space-y-2">
                    {connectedUsers.map((user) => (
                      <div key={user.id} className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: user.color }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-300">{user.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
