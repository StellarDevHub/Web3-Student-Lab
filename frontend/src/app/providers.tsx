'use client';

import { useEffect, type ReactNode } from 'react';
import { warmSocketWorker } from '@/hooks/useWebSocket';

/** Starts the shared transport once per tab without opening a socket eagerly. */
export function SocketWorkerProvider({ children }: { children: ReactNode }) {
  useEffect(() => { warmSocketWorker(); }, []);
  return children;
}
