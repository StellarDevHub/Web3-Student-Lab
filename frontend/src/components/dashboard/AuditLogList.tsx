'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { ListSkeleton } from '../ui/skeletons/ListSkeleton';

interface AuditLog {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: any;
  createdAt: string;
}

export default function AuditLogList() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const response = await apiClient.get('/audit');
        setLogs(response.data);
      } catch (error) {
        console.error('Failed to fetch audit logs:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchLogs();
  }, []);

  if (isLoading) {
    return <ListSkeleton count={3} />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-text-secondary font-light italic">
        No administrative actions recorded in the current session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <div
          key={log.id}
          className="bg-background border-border-theme/50 group rounded-lg border p-4 transition-colors hover:border-red-500/20"
        >
          <div className="mb-2 flex items-start justify-between">
            <span className="text-xs font-black tracking-widest text-red-500 uppercase">
              {log.action.replace(/_/g, ' ')}
            </span>
            <span className="text-text-secondary font-mono text-[10px]">
              {new Date(log.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-sm">
              <span className="text-text-secondary mr-2 text-[10px] font-bold uppercase">
                Operator:
              </span>
              {log.userEmail || 'System'}
            </p>
            {log.entity && (
              <p className="text-foreground text-sm">
                <span className="text-text-secondary mr-2 text-[10px] font-bold uppercase">
                  Entity:
                </span>
                {log.entity}{' '}
                {log.entityId && (
                  <span className="text-text-secondary font-mono text-xs">({log.entityId})</span>
                )}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
