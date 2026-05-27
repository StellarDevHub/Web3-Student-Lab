'use client';

import { Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OfflineNotificationProps {
  onClose?: () => void;
  autoHideDuration?: number;
}

export function OfflineNotification({
  onClose,
  autoHideDuration = 5000,
}: OfflineNotificationProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check initial state
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setIsVisible(true);
      // Auto-hide online notification after delay
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDuration);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsVisible(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoHideDuration]);

  if (!isVisible) return null;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (isOnline) {
    return (
      <div className="animate-in slide-in-from-bottom-2 fixed right-4 bottom-4 z-50 duration-300">
        <div className="flex items-center gap-3 rounded-lg bg-green-900 px-4 py-3 text-green-100 shadow-lg backdrop-blur-sm">
          <Wifi className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Back Online</p>
            <p className="text-xs opacity-90">Your connection has been restored</p>
          </div>
          <button
            onClick={handleClose}
            className="ml-2 rounded p-1 transition-colors hover:bg-green-800"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-bottom-2 fixed right-4 bottom-4 z-50 duration-300">
      <div className="flex items-center gap-3 rounded-lg bg-amber-900 px-4 py-3 text-amber-100 shadow-lg backdrop-blur-sm">
        <WifiOff className="h-5 w-5 flex-shrink-0 animate-pulse" />
        <div className="flex-1">
          <p className="text-sm font-medium">Offline Mode</p>
          <p className="text-xs opacity-90">
            Cached content is available. Core features may be limited.
          </p>
        </div>
        <button
          onClick={handleClose}
          className="ml-2 rounded p-1 transition-colors hover:bg-amber-800"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
