'use client';

import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

const AVAILABLE_OFFLINE = [
  'Previously visited courses',
  'Learning materials you already opened',
  'Certificates overview',
  'Saved progress',
];

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-2xl flex-col items-center justify-center p-4 text-center">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
          isOnline ? 'bg-emerald-500/10' : 'bg-violet-500/10'
        }`}
      >
        {isOnline ? (
          <Wifi className="h-10 w-10 text-emerald-500" aria-hidden="true" />
        ) : (
          <WifiOff className="h-10 w-10 text-violet-500" aria-hidden="true" />
        )}
      </div>

      <h1 className="mb-3 text-3xl font-black tracking-tight">
        {isOnline ? "You're back online" : "You're offline"}
      </h1>

      <p className="text-text-secondary mb-2 leading-relaxed">
        {isOnline
          ? 'Your connection has been restored. Reload to pick up where you left off with current data.'
          : 'No internet connection detected. You can still access content from your previous visits.'}
      </p>

      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="border-border-theme bg-bg-secondary mt-6 w-full rounded-xl border p-5 text-left"
        >
          <h2 className="text-text-secondary mb-3 text-xs font-bold tracking-widest uppercase">
            Available offline
          </h2>
          <ul className="space-y-2">
            {AVAILABLE_OFFLINE.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <span className="text-violet-500" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold tracking-wide text-white uppercase transition-colors hover:bg-red-700"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {isOnline ? 'Reload now' : 'Try again'}
      </button>

      <p className="text-text-secondary mt-6 text-xs">
        Core learning content will resync automatically once your connection is restored.
      </p>
    </div>
  );
}
