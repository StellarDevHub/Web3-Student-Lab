'use client';

import { useServiceWorker } from '@/hooks/useServiceWorker';
import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface UpdateAvailableNotificationProps {
  onUpdate?: () => void;
  onDismiss?: () => void;
}

export function UpdateAvailableNotification({
  onUpdate,
  onDismiss,
}: UpdateAvailableNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const { skipWaiting, registration } = useServiceWorker({
    onUpdated: () => {
      console.log('[UpdateNotif] Update available');
      setIsVisible(true);
    },
  });

  useEffect(() => {
    // Check if there's already a waiting service worker
    if (registration?.waiting) {
      setIsVisible(true);
    }
  }, [registration?.waiting]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    skipWaiting();
    onUpdate?.();

    // Give time for new service worker to activate
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div className="animate-in slide-in-from-bottom-2 fixed bottom-4 left-4 z-50 duration-300">
      <div className="flex max-w-md items-center gap-3 rounded-lg bg-blue-900 px-4 py-3 text-blue-100 shadow-lg backdrop-blur-sm">
        <RefreshCw className={`h-5 w-5 flex-shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-medium">New Version Available</p>
          <p className="text-xs opacity-90">An update to the app is ready to install.</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="rounded bg-blue-500 px-3 py-1 text-xs font-semibold transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Update Now'}
            </button>
            <button
              onClick={handleDismiss}
              disabled={isUpdating}
              className="rounded bg-blue-800 px-3 py-1 text-xs font-semibold transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          disabled={isUpdating}
          className="ml-2 rounded p-1 transition-colors hover:bg-blue-800 disabled:opacity-50"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
