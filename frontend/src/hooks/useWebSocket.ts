'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, WebSocketMessage } from '@/lib/websocket';

export interface UseWebSocketOptions {
  url?: string;
  token?: string | null;
  autoConnect?: boolean;
  channels?: string[];
}

type WorkerEvent =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'message'; message: WebSocketMessage }
  | { type: 'error'; message: string };
type WorkerCommand =
  | { type: 'connect'; url: string; token?: string | null }
  | { type: 'disconnect' }
  | { type: 'send'; messageType: string; data: unknown }
  | { type: 'subscribe'; channel: string; payload?: Record<string, unknown> }
  | { type: 'unsubscribe'; channel: string };

const DEFAULT_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
let worker: SharedWorker | null = null;
let activeConsumers = 0;

function getWorker(): SharedWorker | null {
  if (typeof window === 'undefined' || typeof SharedWorker === 'undefined') return null;
  if (!worker) {
    worker = new SharedWorker(new URL('../workers/socket.sharedworker.ts', import.meta.url), {
      name: 'web3-student-lab-socket',
    });
    worker.port.start();
  }
  return worker;
}

/** Used by the root provider to prepare the shared transport after hydration. */
export function warmSocketWorker() { getWorker(); }

export const useWebSocket = (urlOrOptions?: string | UseWebSocketOptions) => {
  const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : urlOrOptions ?? {};
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bufferedCount] = useState(0);
  const portRef = useRef<MessagePort | null>(null);

  const post = useCallback((command: WorkerCommand) => portRef.current?.postMessage(command), []);
  const sendMessage = useCallback((type: string, data: unknown) => post({ type: 'send', messageType: type, data }), [post]);
  const subscribe = useCallback((channel: string, payload?: Record<string, unknown>) => post({ type: 'subscribe', channel, payload }), [post]);
  const unsubscribe = useCallback((channel: string) => post({ type: 'unsubscribe', channel }), [post]);
  const disconnect = useCallback(() => post({ type: 'disconnect' }), [post]);
  const reconnect = useCallback(() => post({ type: 'connect', url: options.url ?? DEFAULT_URL, token: options.token ?? localStorage.getItem('auth_token') }), [options.token, options.url, post]);

  useEffect(() => {
    const activeWorker = getWorker();
    if (!activeWorker) { setError('SharedWorker is not supported by this browser.'); return undefined; }
    const port = activeWorker.port;
    portRef.current = port;
    activeConsumers += 1;
    const onMessage = (event: MessageEvent<WorkerEvent>) => {
      if (event.data.type === 'status') setStatus(event.data.status);
      if (event.data.type === 'message') setLastMessage(event.data.message);
      if (event.data.type === 'error') setError(event.data.message);
    };
    port.addEventListener('message', onMessage);
    if (options.autoConnect ?? true) port.postMessage({ type: 'connect', url: options.url ?? DEFAULT_URL, token: options.token ?? localStorage.getItem('auth_token') } satisfies WorkerCommand);
    options.channels?.forEach((channel) => port.postMessage({ type: 'subscribe', channel } satisfies WorkerCommand));
    return () => {
      options.channels?.forEach((channel) => port.postMessage({ type: 'unsubscribe', channel } satisfies WorkerCommand));
      activeConsumers -= 1;
      if (activeConsumers === 0) port.postMessage({ type: 'disconnect' } satisfies WorkerCommand);
      port.removeEventListener('message', onMessage);
      portRef.current = null;
    };
  }, [options.autoConnect, options.channels?.join(','), options.token, options.url]);

  return { status, isConnected: status === 'connected', lastMessage, error, bufferedCount, sendMessage, subscribe, unsubscribe, disconnect, reconnect };
};
