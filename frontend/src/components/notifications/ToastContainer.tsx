'use client';

import { AppNotification, NotificationType, useNotifications, getStellarExpertUrl } from '@/contexts/NotificationContext';
import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Info,
  AlertCircle,
  BookOpen,
  Award,
  Star,
  X,
  Bell,
  ExternalLink,
  Layers,
  Loader2
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

const DEFAULT_AUTO_DISMISS_MS = 5000;

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-0 bottom-0 z-[100] flex flex-col gap-3 p-6 sm:right-6 sm:bottom-6"
    >
      {toasts.map((t) => (
        <Toast key={t.id} notification={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function Toast({
  notification,
  onDismiss,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const { id, title, message, type, count, txHash, explorerUrl, step, totalSteps, stepName, progress, priority, autoDismissMs } = notification;
  const [isHovered, setIsHovered] = useState(false);
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.system;
  const duration = autoDismissMs || DEFAULT_AUTO_DISMISS_MS;

  const resolvedExplorerUrl = explorerUrl || (txHash ? getStellarExpertUrl(txHash) : undefined);
  const isInProgress = step !== undefined && totalSteps !== undefined && step < totalSteps;

  useEffect(() => {
    if (isHovered || isInProgress) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, onDismiss, isHovered, isInProgress, duration]);

  const computedProgress = progress ?? (step !== undefined && totalSteps !== undefined && totalSteps > 0 ? Math.round((step / totalSteps) * 100) : undefined);

  return (
    <div
      role="alert"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`animate-in slide-in-from-right-8 fade-in zoom-in-95 pointer-events-auto relative flex w-80 sm:w-96 flex-col overflow-hidden rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${config.bg} ${config.border}`}
    >
      {/* Glossy overlay effect */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />

      <div className="flex items-start gap-3 relative z-10">
        {/* Icon */}
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 shadow-inner ${config.iconBg} ${config.iconColor}`}
        >
          {isInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : config.icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-outfit text-sm font-semibold tracking-wide text-white/95">{title}</p>
            {count !== undefined && count > 1 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/10">
                x{count}
              </span>
            )}
            {priority === 'urgent' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                Urgent
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70">{message}</p>

          {/* Multi-step progress indicator */}
          {step !== undefined && totalSteps !== undefined && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex justify-between items-center text-[11px] text-white/80 font-medium">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3 w-3 text-cyan-400" />
                  {stepName || `Step ${step} of ${totalSteps}`}
                </span>
                <span>{computedProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                  style={{ width: `${computedProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Block explorer deep-link */}
          {resolvedExplorerUrl && (
            <div className="mt-2.5">
              <a
                href={resolvedExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
              >
                <span>View on Stellar Expert</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/40 transition-all hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Auto-dismiss Progress Bar for standard toasts */}
      {!isInProgress && (
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-white/10">
          <div
            className={`h-full ${config.iconBg.replace('bg-', 'bg-').replace('/20', '')}`}
            style={{
              animation: isHovered ? 'none' : `shrink ${duration}ms linear forwards`,
              width: isHovered ? '100%' : '100%',
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
