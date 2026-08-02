'use client';

import { useServiceWorker } from '@/hooks/useServiceWorker';
import { CheckCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OfflineReadyNotificationProps {
  onDismiss?: () => void;
  autoHideDuration?: number;
}

export function OfflineReadyNotification({
  onDismiss,
  autoHideDuration = 3000,
}: OfflineReadyNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  const { status } = useServiceWorker({
    onReady: () => {
      console.log('[OfflineReady] Service worker ready');
      if (!hasShown) {
        setIsVisible(true);
        setHasShown(true);

        // Auto-hide after duration
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, autoHideDuration);

        return () => clearTimeout(timer);
      }
    },
  });

  useEffect(() => {
    if (status === 'ready' && !hasShown) {
      setIsVisible(true);
      setHasShown(true);

      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDuration);

      return () => clearTimeout(timer);
    }
  }, [status, hasShown, autoHideDuration]);

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div className="animate-in slide-in-from-top-2 fixed top-4 right-4 z-50 duration-300">
      <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-purple-900 to-purple-800 px-4 py-3 text-purple-100 shadow-lg backdrop-blur-sm">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-purple-300" />
        <div className="flex-1">
          <p className="text-sm font-medium">Offline Ready</p>
          <p className="text-xs opacity-90">
            Your app is now ready for offline use. Core content is cached and available.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-2 rounded p-1 transition-colors hover:bg-purple-700"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
