'use client';

import {
  groupNotifications,
  AppNotification,
  NotificationType,
  useNotifications,
} from '@/contexts/NotificationContext';
import { useEffect, useMemo, useState } from 'react';
import { VirtualizedList } from './VirtualizedList';
import {
  CheckCircle,
  Info,
  AlertCircle,
  BookOpen,
  Award,
  Star,
  X,
  Bell,
  CheckCheck,
} from 'lucide-react';

const TYPE_OPTIONS: { value: 'all' | NotificationType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'signature', label: 'Signatures' },
  { value: 'enrollment', label: 'Enrollments' },
  { value: 'certificate', label: 'Certificates' },
  { value: 'course_update', label: 'Courses' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'learning_opportunity', label: 'Opportunities' },
  { value: 'system', label: 'System' },
  { value: 'error', label: 'Errors' },
];

const TYPE_CONFIG: Record<
  NotificationType,
  { bg: string; border: string; icon: React.ReactNode; iconBg: string; iconColor: string }
> = {
  signature: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    icon: <CheckCircle className="h-4 w-4" />
  },
  enrollment: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    icon: <BookOpen className="h-4 w-4" />
  },
  certificate: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    iconBg: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
    icon: <Award className="h-4 w-4" />
  },
  system: {
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    iconBg: 'bg-gray-500/20',
    iconColor: 'text-gray-400',
    icon: <Info className="h-4 w-4" />
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
    icon: <AlertCircle className="h-4 w-4" />
  },
  course_update: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    iconBg: 'bg-violet-500/20',
    iconColor: 'text-violet-400',
    icon: <Bell className="h-4 w-4" />
  },
  announcement: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    iconBg: 'bg-cyan-500/20',
    iconColor: 'text-cyan-400',
    icon: <Star className="h-4 w-4" />
  },
  learning_opportunity: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    icon: <Star className="h-4 w-4" />
  },
};

const ITEM_HEIGHT = 88;
const SIDEBAR_LIST_HEIGHT = 500;

interface Props {
  open: boolean;
  onClose: () => void;
}

import { createPortal } from 'react-dom';

export function NotificationSidebar({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<'all' | NotificationType>('all');
  const [grouped, setGrouped] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? notifications : notifications.filter((n) => n.type === filter)),
    [notifications, filter]
  );

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="animate-in fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        role="dialog"
        aria-label="Notification Center"
        className="animate-in slide-in-from-right fixed top-0 right-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl"
      >
        {/* Decorative top glow */}
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 opacity-50" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="font-outfit text-lg font-bold text-white">Notifications</span>
            {unreadCount > 0 && (
              <span className="flex h-5 items-center justify-center rounded-full bg-blue-500 px-2 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={markAllRead}
              title="Mark all as read"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-6 py-3 scrollbar-hide">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                filter === opt.value
                  ? 'bg-white text-zinc-950 shadow-md scale-105'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setGrouped((g) => !g)}
            className={`ml-auto shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              grouped ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {grouped ? 'Grouped' : 'List'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden relative">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-3xl shadow-inner border border-white/5">
                <Bell className="text-gray-500 h-8 w-8 opacity-50" />
              </div>
              <div>
                <p className="font-outfit text-sm font-semibold text-white/80">You're all caught up!</p>
                <p className="mt-1 text-xs text-gray-500">No new notifications right now.</p>
              </div>
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
    </>,
    document.body
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
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const config = TYPE_CONFIG[g.type] || TYPE_CONFIG.system;
          return (
            <div
              key={g.type}
              className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-white/5 bg-white/5 px-4 py-4 transition-all duration-300 hover:scale-[1.01] hover:border-white/10 hover:bg-white/10"
              onClick={() => onMarkRead(g.latestId)}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-inner transition-transform group-hover:scale-110 ${config.iconBg} ${config.border} ${config.iconColor}`}
              >
                {config.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-outfit text-sm font-semibold text-white/95">{g.label}</span>
                  {!g.read && (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {g.count === 1 ? '1 new event pending' : `${g.count} new events pending`}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-gray-500">
                {formatTime(g.latestTimestamp)}
              </span>
            </div>
          );
        })}
      </div>
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
  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
  
  return (
    <div
      className={`group relative mx-3 my-1 flex h-[80px] cursor-pointer items-start gap-4 overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300 hover:scale-[1.01] ${
        n.read 
          ? 'border-white/5 bg-white/[0.02] hover:bg-white/5' 
          : `bg-white/5 border-white/10 hover:bg-white/10`
      }`}
      onClick={() => !n.read && onMarkRead(n.id)}
    >
      {/* Type Indicator Line */}
      <div className={`absolute left-0 top-0 h-full w-1 ${config.iconColor.replace('text-', 'bg-')} opacity-20 group-hover:opacity-100 transition-opacity`} />

      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-inner transition-transform group-hover:scale-110 ${config.iconBg} ${config.border} ${config.iconColor}`}
      >
        {config.icon}
      </div>
      
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <p className={`truncate text-xs font-semibold ${n.read ? 'text-white/60' : 'text-white/95'}`}>{n.title}</p>
          {!n.read && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
          )}
        </div>
        <p className={`mt-1 line-clamp-1 text-[11px] ${n.read ? 'text-gray-600' : 'text-gray-400'}`}>{n.message}</p>
      </div>
      <span className="mt-1 shrink-0 text-[10px] text-gray-500">{formatTime(n.timestamp)}</span>
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
