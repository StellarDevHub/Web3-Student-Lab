'use client';

import { NotificationType, useNotifications } from '@/contexts/NotificationContext';
import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Info,
  AlertCircle,
  BookOpen,
  Award,
  Star,
  X,
  Bell
} from 'lucide-react';

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

const AUTO_DISMISS_MS = 5000;

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-0 bottom-0 z-[100] flex flex-col gap-3 p-6 sm:right-6 sm:bottom-6"
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          id={t.id}
          title={t.title}
          message={t.message}
          type={t.type}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  );
}

function Toast({
  id,
  title,
  message,
  type,
  onDismiss,
}: {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  onDismiss: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.system;

  useEffect(() => {
    if (isHovered) return;
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss, isHovered]);

  return (
    <div
      role="alert"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`animate-in slide-in-from-right-8 fade-in zoom-in-95 pointer-events-auto relative flex w-80 items-start gap-4 overflow-hidden rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${config.bg} ${config.border}`}
    >
      {/* Glossy overlay effect */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />
      
      {/* Icon */}
      <div
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 shadow-inner ${config.iconBg} ${config.iconColor}`}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 relative z-10">
        <p className="font-outfit text-sm font-semibold tracking-wide text-white/95">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70">{message}</p>
      </div>

      {/* Close button */}
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/40 transition-all hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-[3px] w-full bg-white/10">
        <div
          className={`h-full ${config.iconBg.replace('bg-', 'bg-').replace('/20', '')}`}
          style={{
            animation: isHovered ? 'none' : `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
            width: isHovered ? '100%' : '100%',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
