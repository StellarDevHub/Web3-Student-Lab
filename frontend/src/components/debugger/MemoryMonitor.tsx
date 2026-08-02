'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { YjsMemoryManager } from '@/hooks/useCanvasCollaborationFixed';

interface MemoryStats {
  instanceCount: number;
  memoryUsage?: number;
  lastCleanup?: Date;
}

export function MemoryMonitor() {
  const [stats, setStats] = useState<MemoryStats>({ instanceCount: 0 });
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<Date | null>(null);

  const updateStats = () => {
    const newStats = YjsMemoryManager.getStats();
    setStats(newStats);
  };

  useEffect(() => {
    updateStats();

    const interval = setInterval(updateStats, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleForceCleanup = () => {
    YjsMemoryManager.forceCleanup();
    setLastCleanup(new Date());
    updateStats();
  };

  const formatMemoryUsage = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const getMemoryStatus = (): 'good' | 'warning' | 'critical' => {
    if (!stats.memoryUsage) return 'good';
    const mb = stats.memoryUsage / (1024 * 1024);
    if (mb > 200) return 'critical';
    if (mb > 150) return 'warning';
    return 'good';
  };

  const getStatusColor = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
    }
  };

  const getStatusIcon = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'critical':
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const memoryStatus = getMemoryStatus();

  if (process.env.NODE_ENV === 'production') {
    return null; // Don't show in production
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className={`rounded-lg border bg-white shadow-lg ${isExpanded ? 'w-80' : 'w-auto'}`}>
        {/* Header */}
        <div
          className="flex cursor-pointer items-center justify-between p-3 hover:bg-gray-50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">Memory Monitor</span>
            <div className={`flex items-center space-x-1 ${getStatusColor(memoryStatus)}`}>
              {getStatusIcon(memoryStatus)}
              <span className="text-xs">{memoryStatus}</span>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-3 border-t border-gray-200 p-4">
            {/* Stats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Yjs Instances:</span>
                <span className="text-sm font-medium">{stats.instanceCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Memory Usage:</span>
                <span className="text-sm font-medium">{formatMemoryUsage(stats.memoryUsage)}</span>
              </div>
              {lastCleanup && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Cleanup:</span>
                  <span className="text-sm font-medium">{lastCleanup.toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* Memory Status Indicator */}
            <div className="border-t border-gray-200 pt-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600">Memory Status:</span>
                <div className={`flex items-center space-x-1 ${getStatusColor(memoryStatus)}`}>
                  {getStatusIcon(memoryStatus)}
                  <span className="text-xs capitalize">{memoryStatus}</span>
                </div>
              </div>

              {memoryStatus === 'warning' && (
                <div className="rounded bg-yellow-50 p-2 text-xs text-yellow-600">
                  Memory usage is getting high. Consider closing unused collaboration sessions.
                </div>
              )}

              {memoryStatus === 'critical' && (
                <div className="rounded bg-red-50 p-2 text-xs text-red-600">
                  Critical memory usage detected! Force cleanup recommended.
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 border-t border-gray-200 pt-2">
              <button
                onClick={handleForceCleanup}
                className="flex w-full items-center justify-center space-x-2 rounded bg-red-500 px-3 py-2 text-sm text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
                <span>Force Cleanup</span>
              </button>

              <button
                onClick={updateStats}
                className="w-full rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
              >
                Refresh Stats
              </button>
            </div>

            {/* Info */}
            <div className="rounded bg-gray-50 p-2 text-xs text-gray-500">
              <div className="space-y-1">
                <p>• Yjs instances are automatically cleaned up after 5 minutes of inactivity</p>
                <p>• Maximum 10 concurrent instances allowed</p>
                <p>• Memory usage above 200MB is considered critical</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
