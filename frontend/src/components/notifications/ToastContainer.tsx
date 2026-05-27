'use client';

import { NotificationType, useNotifications } from '@/contexts/NotificationContext';
import { useEffect } from 'react';

const TYPE_COLORS: Record<NotificationType, string> = {
  signature: 'border-blue-500/40 bg-blue-500/10',
  enrollment: 'border-green-500/40 bg-green-500/10',
  certificate: 'border-yellow-500/40 bg-yellow-500/10',
  system: 'border-gray-500/40 bg-gray-500/10',
  error: 'border-red-500/40 bg-red-500/10',
};

const AUTO_DISMISS_MS = 4000;

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col gap-2"
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
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      role="alert"
      className={`animate-in slide-in-from-right-4 pointer-events-auto flex w-72 items-start gap-3 rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md ${TYPE_COLORS[type]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-white">{title}</p>
        <p className="truncate text-[11px] text-gray-400">{message}</p>
      </div>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="mt-0.5 shrink-0 text-xs text-gray-500 transition-colors hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
