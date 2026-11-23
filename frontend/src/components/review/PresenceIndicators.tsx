'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Circle, Activity, Clock } from 'lucide-react';
import { CommentSyncUser } from '../../lib/review/CommentSync';

interface PresenceIndicatorsProps {
  users: CommentSyncUser[];
  currentUser: CommentSyncUser;
  maxVisibleUsers?: number;
  showUserDetails?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

interface UserActivity {
  userId: string;
  lastSeen: Date;
  activity: 'typing' | 'viewing' | 'idle';
}

export default function PresenceIndicators({
  users,
  currentUser,
  maxVisibleUsers = 5,
  showUserDetails = false,
  position = 'top-right',
}: PresenceIndicatorsProps) {
  const [userActivities, setUserActivities] = useState<Map<string, UserActivity>>(new Map());
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out current user
  const otherUsers = users.filter((user) => user.id !== currentUser.id);
  const visibleUsers = otherUsers.slice(0, maxVisibleUsers);
  const hiddenUsersCount = otherUsers.length - visibleUsers.length;

  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  // Update user activities
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const updatedActivities = new Map<string, UserActivity>();

      users.forEach((user) => {
        if (user.id === currentUser.id) return;

        const existingActivity = userActivities.get(user.id);
        const timeSinceLastUpdate = existingActivity
          ? now.getTime() - existingActivity.lastSeen.getTime()
          : Infinity;

        // Determine activity status
        let activity: UserActivity['activity'] = 'idle';
        if (timeSinceLastUpdate < 5000) {
          // Active within 5 seconds
          activity = existingActivity?.activity || 'viewing';
        } else if (timeSinceLastUpdate < 30000) {
          // Active within 30 seconds
          activity = 'viewing';
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
    users.forEach((user) => {
      if (user.id === currentUser.id) return;

      if (user.cursor) {
        setUserActivities((prev) => {
          const updated = new Map(prev);
          updated.set(user.id, {
            userId: user.id,
            lastSeen: new Date(),
            activity: 'viewing',
          });
          return updated;
        });
      }
    });
  }, [users, currentUser.id]);

  const getActivityIcon = (activity: UserActivity['activity']) => {
    switch (activity) {
      case 'typing':
        return <Activity className="h-3 w-3 animate-pulse text-green-400" />;
      case 'viewing':
        return <Circle className="h-3 w-3 text-blue-400" />;
      case 'idle':
        return <Circle className="h-3 w-3 text-gray-400" />;
      default:
        return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };

  const getActivityText = (activity: UserActivity['activity']) => {
    switch (activity) {
      case 'typing':
        return 'Typing...';
      case 'viewing':
        return 'Viewing';
      case 'idle':
        return 'Idle';
      default:
        return 'Offline';
    }
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-40`}>
      {/* Compact view */}
      <div
        className={`rounded-lg border border-white/20 bg-black/80 backdrop-blur-sm transition-all duration-200 ${
          isExpanded ? 'min-w-64 p-4' : 'p-2'
        }`}
      >
        {/* Header */}
        <div
          className="flex cursor-pointer items-center space-x-2"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Users className="h-4 w-4 text-white" />
          <span className="text-sm font-medium text-white">
            {otherUsers.length} {otherUsers.length === 1 ? 'user' : 'users'}
          </span>

          {otherUsers.length > 0 && (
            <div className="flex -space-x-2">
              {visibleUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-black/50 text-xs font-bold text-white"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}

              {hiddenUsersCount > 0 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-black/50 bg-gray-600 text-xs font-bold text-white">
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
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2"
            >
              <div className="border-t border-white/10 pt-3">
                <h4 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  Active Users
                </h4>

                <div className="space-y-2">
                  {otherUsers.map((user) => {
                    const activity = userActivities.get(user.id);
                    return (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between rounded-lg bg-white/5 p-2 transition-colors hover:bg-white/10"
                      >
                        <div className="flex items-center space-x-2">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/20 text-sm font-bold text-white"
                            style={{ backgroundColor: user.color }}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>

                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">{user.name}</span>

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
                            <Clock className="h-3 w-3" />
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
                  <h4 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    User Details
                  </h4>

                  <div className="space-y-2">
                    {otherUsers.map((user) => (
                      <div key={user.id} className="text-xs text-gray-300">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{user.name}</span>
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: user.color }}
                          />
                        </div>

                        {user.cursor && (
                          <div className="mt-1 text-gray-500">
                            Line {user.cursor.line}, Column {user.cursor.column}
                          </div>
                        )}

                        {user.selection && (
                          <div className="mt-1 text-gray-500">
                            Selected: {user.selection.start.line}:{user.selection.start.column} -{' '}
                            {user.selection.end.line}:{user.selection.end.column}
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
