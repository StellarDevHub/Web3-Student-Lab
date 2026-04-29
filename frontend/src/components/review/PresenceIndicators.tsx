"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Circle, Activity, Clock } from "lucide-react";
import { CommentSyncUser } from "../../lib/review/CommentSync";

interface PresenceIndicatorsProps {
  users: CommentSyncUser[];
  currentUser: CommentSyncUser;
  maxVisibleUsers?: number;
  showUserDetails?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

interface UserActivity {
  userId: string;
  lastSeen: Date;
  activity: "typing" | "viewing" | "idle";
}

export default function PresenceIndicators({
  users,
  currentUser,
  maxVisibleUsers = 5,
  showUserDetails = false,
  position = "top-right",
}: PresenceIndicatorsProps) {
  const [userActivities, setUserActivities] = useState<Map<string, UserActivity>>(new Map());
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out current user
  const otherUsers = users.filter(user => user.id !== currentUser.id);
  const visibleUsers = otherUsers.slice(0, maxVisibleUsers);
  const hiddenUsersCount = otherUsers.length - visibleUsers.length;

  // Position classes
  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  // Update user activities
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const updatedActivities = new Map<string, UserActivity>();

      users.forEach(user => {
        if (user.id === currentUser.id) return;

        const existingActivity = userActivities.get(user.id);
        const timeSinceLastUpdate = existingActivity 
          ? now.getTime() - existingActivity.lastSeen.getTime()
          : Infinity;

        // Determine activity status
        let activity: UserActivity["activity"] = "idle";
        if (timeSinceLastUpdate < 5000) { // Active within 5 seconds
          activity = existingActivity?.activity || "viewing";
        } else if (timeSinceLastUpdate < 30000) { // Active within 30 seconds
          activity = "viewing";
        }

        updatedActivities.set(user.id, {
          userId: user.id,
          lastSeen: existingActivity?.lastSeen || now,
          activity,
        });
      });

      setUserActivities(updatedActivities);
    }, 1000);

    return () => clearInterval(interval);
  }, [users, currentUser.id, userActivities]);

  // Update activity when user cursor moves
  useEffect(() => {
    users.forEach(user => {
      if (user.id === currentUser.id) return;

      if (user.cursor) {
        setUserActivities(prev => {
          const updated = new Map(prev);
          updated.set(user.id, {
            userId: user.id,
            lastSeen: new Date(),
            activity: "viewing",
          });
          return updated;
        });
      }
    });
  }, [users, currentUser.id]);

  const getActivityIcon = (activity: UserActivity["activity"]) => {
    switch (activity) {
      case "typing":
        return <Activity className="w-3 h-3 text-green-400 animate-pulse" />;
      case "viewing":
        return <Circle className="w-3 h-3 text-blue-400" />;
      case "idle":
        return <Circle className="w-3 h-3 text-gray-400" />;
      default:
        return <Circle className="w-3 h-3 text-gray-400" />;
    }
  };

  const getActivityText = (activity: UserActivity["activity"]) => {
    switch (activity) {
      case "typing":
        return "Typing...";
      case "viewing":
        return "Viewing";
      case "idle":
        return "Idle";
      default:
        return "Offline";
    }
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-40`}>
      {/* Compact view */}
      <div
        className={`bg-black/80 border border-white/20 rounded-lg backdrop-blur-sm transition-all duration-200 ${
          isExpanded ? "p-4 min-w-64" : "p-2"
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Users className="w-4 h-4 text-white" />
          <span className="text-sm text-white font-medium">
            {otherUsers.length} {otherUsers.length === 1 ? "user" : "users"}
          </span>
          
          {otherUsers.length > 0 && (
            <div className="flex -space-x-2">
              {visibleUsers.map(user => (
                <div
                  key={user.id}
                  className="w-6 h-6 rounded-full border-2 border-black/50 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              
              {hiddenUsersCount > 0 && (
                <div className="w-6 h-6 rounded-full bg-gray-600 border-2 border-black/50 flex items-center justify-center text-white text-xs font-bold">
                  +{hiddenUsersCount}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expanded view */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2"
            >
              <div className="border-t border-white/10 pt-3">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Active Users
                </h4>
                
                <div className="space-y-2">
                  {otherUsers.map(user => {
                    const activity = userActivities.get(user.id);
                    return (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-white/20"
                            style={{ backgroundColor: user.color }}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          
                          <div className="flex flex-col">
                            <span className="text-sm text-white font-medium">
                              {user.name}
                            </span>
                            
                            <div className="flex items-center space-x-1">
                              {activity && getActivityIcon(activity.activity)}
                              <span className="text-xs text-gray-400">
                                {activity && getActivityText(activity.activity)}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {activity && (
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatLastSeen(activity.lastSeen)}</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {showUserDetails && (
                <div className="border-t border-white/10 pt-3">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    User Details
                  </h4>
                  
                  <div className="space-y-2">
                    {otherUsers.map(user => (
                      <div key={user.id} className="text-xs text-gray-300">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{user.name}</span>
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: user.color }}
                          />
                        </div>
                        
                        {user.cursor && (
                          <div className="text-gray-500 mt-1">
                            Line {user.cursor.line}, Column {user.cursor.column}
                          </div>
                        )}
                        
                        {user.selection && (
                          <div className="text-gray-500 mt-1">
                            Selected: {user.selection.start.line}:{user.selection.start.column} - {user.selection.end.line}:{user.selection.end.column}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
