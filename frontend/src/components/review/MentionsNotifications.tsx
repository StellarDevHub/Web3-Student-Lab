"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AtSign, 
  Bell, 
  X, 
  Check, 
  MessageSquare, 
  User, 
  Code,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search
} from "lucide-react";

interface Mention {
  id: string;
  userId: string;
  userName: string;
  content: string;
  context: {
    type: "comment" | "review" | "suggestion";
    id: string;
    title: string;
  };
  createdAt: Date;
  isRead: boolean;
}

interface Notification {
  id: string;
  type: "mention" | "review_assigned" | "review_completed" | "suggestion_added" | "comment_added";
  title: string;
  message: string;
  from: {
    id: string;
    name: string;
    avatar?: string;
  };
  context?: {
    type: "review" | "comment" | "suggestion";
    id: string;
    title: string;
  };
  createdAt: Date;
  isRead: boolean;
  actionUrl?: string;
}

interface MentionsNotificationsProps {
  currentUser: {
    id: string;
    name: string;
  };
  onNotificationClick?: (notification: Notification) => void;
  onMentionClick?: (mention: Mention) => void;
}

const NOTIFICATION_CONFIG = {
  mention: {
    icon: AtSign,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  review_assigned: {
    icon: User,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  review_completed: {
    icon: CheckCircle,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  suggestion_added: {
    icon: Code,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
  },
  comment_added: {
    icon: MessageSquare,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
  },
};

export default function MentionsNotifications({
  currentUser,
  onNotificationClick,
  onMentionClick,
}: MentionsNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mock data - in real app, this would come from API
  useEffect(() => {
    const mockNotifications: Notification[] = [
      {
        id: "n1",
        type: "mention",
        title: "You were mentioned",
        message: "John mentioned you in a code review comment",
        from: { id: "user1", name: "John Doe" },
        context: {
          type: "review",
          id: "review1",
          title: "Authentication Module Review",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 5),
        isRead: false,
        actionUrl: "/reviews/review1",
      },
      {
        id: "n2",
        type: "review_assigned",
        title: "Review Assigned",
        message: "You have been assigned to review the Payment Module",
        from: { id: "user2", name: "Jane Smith" },
        context: {
          type: "review",
          id: "review2",
          title: "Payment Module Review",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
        isRead: false,
        actionUrl: "/reviews/review2",
      },
      {
        id: "n3",
        type: "review_completed",
        title: "Review Completed",
        message: "Sarah completed her review on Database Module",
        from: { id: "user3", name: "Sarah Johnson" },
        context: {
          type: "review",
          id: "review3",
          title: "Database Module Review",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        isRead: true,
        actionUrl: "/reviews/review3",
      },
    ];

    const mockMentions: Mention[] = [
      {
        id: "m1",
        userId: "user1",
        userName: "John Doe",
        content: "@currentUser Can you review this security implementation?",
        context: {
          type: "comment",
          id: "comment1",
          title: "Security Implementation Review",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 15),
        isRead: false,
      },
      {
        id: "m2",
        userId: "user4",
        userName: "Mike Wilson",
        content: "@currentUser Great work on the optimization!",
        context: {
          type: "review",
          id: "review4",
          title: "Performance Optimization",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
        isRead: true,
      },
    ];

    setNotifications(mockNotifications);
    setMentions(mockMentions);
  }, [currentUser.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setShowMentions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    const matchesFilter = filter === "all" || !notification.isRead;
    const matchesSearch = searchQuery === "" || 
      notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.from.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  // Filter mentions
  const filteredMentions = mentions.filter(mention => {
    const matchesFilter = filter === "all" || !mention.isRead;
    const matchesSearch = searchQuery === "" || 
      mention.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mention.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mention.context.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  // Mark notification as read
  const markNotificationAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification
      )
    );
  };

  // Mark mention as read
  const markMentionAsRead = (mentionId: string) => {
    setMentions(prev =>
      prev.map(mention =>
        mention.id === mentionId
          ? { ...mention, isRead: true }
          : mention
      )
    );
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    markNotificationAsRead(notification.id);
    onNotificationClick?.(notification);
    setShowNotifications(false);
  };

  // Handle mention click
  const handleMentionClick = (mention: Mention) => {
    markMentionAsRead(mention.id);
    onMentionClick?.(mention);
    setShowMentions(false);
  };

  // Get unread count
  const unreadNotificationCount = notifications.filter(n => !n.isRead).length;
  const unreadMentionCount = mentions.filter(m => !m.isRead).length;

  // Format time
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell */}
      <div className="flex items-center space-x-3">
        {/* Mentions */}
        <div className="relative">
          <button
            onClick={() => {
              setShowMentions(!showMentions);
              setShowNotifications(false);
            }}
            className="relative p-2 text-gray-400 hover:text-white transition-colors"
          >
            <AtSign className="w-5 h-5" />
            {unreadMentionCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadMentionCount}
              </span>
            )}
          </button>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowMentions(false);
            }}
            className="relative p-2 text-gray-400 hover:text-white transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadNotificationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notifications Dropdown */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-96 max-h-96 bg-zinc-950 border border-white/20 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Notifications</h3>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60 text-sm"
                  />
                </div>
                
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60 text-sm"
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                </select>
              </div>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto max-h-64">
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No notifications found</p>
                </div>
              ) : (
                filteredNotifications.map((notification) => {
                  const config = NOTIFICATION_CONFIG[notification.type];
                  const Icon = config.icon;
                  
                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                        !notification.isRead ? "bg-white/5" : ""
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg ${config.bgColor} flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-medium text-white truncate">
                              {notification.title}
                            </h4>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          
                          <p className="text-xs text-gray-300 mb-1">
                            {notification.message}
                          </p>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              {notification.from.name} • {formatTime(notification.createdAt)}
                            </span>
                            
                            {notification.context && (
                              <span className="text-xs text-gray-500">
                                {notification.context.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10">
              <button className="w-full text-center text-sm text-red-400 hover:text-red-300 transition-colors">
                Mark all as read
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mentions Dropdown */}
      <AnimatePresence>
        {showMentions && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-96 max-h-96 bg-zinc-950 border border-white/20 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Mentions</h3>
                <button
                  onClick={() => setShowMentions(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search mentions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60 text-sm"
                  />
                </div>
                
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60 text-sm"
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                </select>
              </div>
            </div>

            {/* Mentions List */}
            <div className="overflow-y-auto max-h-64">
              {filteredMentions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <AtSign className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No mentions found</p>
                </div>
              ) : (
                filteredMentions.map((mention) => (
                  <motion.div
                    key={mention.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                      !mention.isRead ? "bg-white/5" : ""
                    }`}
                    onClick={() => handleMentionClick(mention)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                        {mention.userName.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-medium text-white">
                            {mention.userName}
                          </h4>
                          {!mention.isRead && (
                            <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-300 mb-1">
                          {mention.content}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {formatTime(mention.createdAt)}
                          </span>
                          
                          <span className="text-xs text-gray-500">
                            {mention.context.title}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10">
              <button className="w-full text-center text-sm text-red-400 hover:text-red-300 transition-colors">
                Mark all as read
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
