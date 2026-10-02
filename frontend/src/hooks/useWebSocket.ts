import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionStatus,
  WebSocketMessage,
  getWebSocketClient,
} from '@/lib/websocket';

export interface UseWebSocketOptions {
  url?: string;
  token?: string | null;
  autoConnect?: boolean;
  channels?: string[];
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxBufferSize?: number;
}

export const useWebSocket = (urlOrOptions?: string | UseWebSocketOptions) => {
  const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : urlOrOptions ?? {};
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bufferedCount, setBufferedCount] = useState(0);
  const clientRef = useRef(getWebSocketClient());

  const sendMessage = useCallback((type: string, data: any) => {
    clientRef.current.send(type, data);
    setBufferedCount(clientRef.current.getBufferedCount());
  }, []);

  const subscribe = useCallback((channel: string, payload?: Record<string, unknown>) => {
    clientRef.current.subscribe(channel, payload);
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    clientRef.current.unsubscribe(channel);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current.connect();
  }, []);

  useEffect() {
    const client = clientRef.current;
    const token = options.token ?? localStorage.getItem('auth_token');
    if (!token) {
      return undefined;
    }

    const unsubscribeStatus = client.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      setIsConnected(nextStatus === 'connected');
    });

    const unsubscribeMessage = client.onMessage((message) => {
      setLastMessage(message);
      setBufferedCount(client.getBufferedCount());
    });

    const unsubscribeError = client.onError((err) => {
      setError(err.message);
    });

    options.channels.forEach((channel) => client.subscribe(channel));

    if (options.autoConnect ?? true) {
      client.connect();
    }

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      unsubscribeError();
    };
  }, [options.token, options.autoConnect, options.channels?.join(',')]);

  return {
    status,
    isConnected,
    lastMessage,
    error,
    bufferedCount,
    sendMessage,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect,
  };
};
