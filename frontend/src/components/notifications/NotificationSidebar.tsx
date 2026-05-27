'use client';

import {
  groupNotifications,
  AppNotification,
  NotificationType,
  useNotifications,
} from '@/contexts/NotificationContext';
import { useMemo, useState } from 'react';
import { VirtualizedList } from './VirtualizedList';

const TYPE_OPTIONS: { value: 'all' | NotificationType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'signature', label: 'Signatures' },
  { value: 'enrollment', label: 'Enrollments' },
  { value: 'certificate', label: 'Certificates' },
  { value: 'system', label: 'System' },
  { value: 'error', label: 'Errors' },
];

const TYPE_COLORS: Record<NotificationType, string> = {
  signature: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  enrollment: 'text-green-400 bg-green-400/10 border-green-400/20',
  certificate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  system: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
  error: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const ITEM_HEIGHT = 72;
const SIDEBAR_LIST_HEIGHT = 480;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationSidebar({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<'all' | NotificationType>('all');
  const [grouped, setGrouped] = useState(true);

  const filtered = useMemo(
    () => (filter === 'all' ? notifications : notifications.filter((n) => n.type === filter)),
    [notifications, filter]
  );

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        role="dialog"
        aria-label="Notification Center"
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-zinc-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-widest text-white uppercase">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="text-[10px] font-black tracking-widest text-gray-400 uppercase transition-colors hover:text-white"
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="flex h-8 w-8 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-4 py-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`shrink-0 rounded px-3 py-1 text-[10px] font-black tracking-widest uppercase transition-colors ${
                filter === opt.value
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setGrouped((g) => !g)}
            className={`ml-auto shrink-0 rounded px-3 py-1 text-[10px] font-black tracking-widest uppercase transition-colors ${
              grouped ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {grouped ? 'Grouped' : 'Flat'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-600">
              <span className="text-3xl">🔔</span>
              <span className="text-sm font-black tracking-widest uppercase">No notifications</span>
            </div>
          ) : grouped ? (
            <GroupedView groups={groups} onMarkRead={markRead} />
          ) : (
            <VirtualizedList
              items={filtered}
              itemHeight={ITEM_HEIGHT}
              containerHeight={SIDEBAR_LIST_HEIGHT}
              renderItem={(n) => (
                <NotificationRow key={n.id} notification={n} onMarkRead={markRead} />
              )}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function GroupedView({
  groups,
  onMarkRead,
}: {
  groups: ReturnType<typeof groupNotifications>;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      {groups.map((g) => (
        <div
          key={g.type}
          className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5"
          onClick={() => onMarkRead(g.latestId)}
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${TYPE_COLORS[g.type]}`}
          >
            {g.count > 99 ? '99+' : g.count}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wide text-white">{g.label}</span>
              {!g.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
            </div>
            <p className="truncate text-[11px] text-gray-500">
              {g.count === 1 ? '1 new event' : `${g.count} new events`}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-gray-600">
            {formatTime(g.latestTimestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onMarkRead,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      className={`flex h-[72px] cursor-pointer items-start gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5 ${
        n.read ? 'opacity-50' : ''
      }`}
      onClick={() => !n.read && onMarkRead(n.id)}
    >
      <div
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-red-500'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-white">{n.title}</p>
        <p className="truncate text-[11px] text-gray-500">{n.message}</p>
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] text-gray-600">{formatTime(n.timestamp)}</span>
    </div>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
