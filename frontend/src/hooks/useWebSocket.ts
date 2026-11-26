import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionStatus,
  ResilientWebSocketClient,
  WebSocketMessage,
  getWebSocketClient,
} from '@/lib/websocket';
import { getSessionBroadcastManager } from '@/services/session/broadcastSync';
import { getStoredSessionToken } from '@/lib/credentialStorage';

export interface UseWebSocketOptions {
  url?: string;
  token?: string | null;
  autoConnect?: boolean;
  preventDuplicateTabs?: boolean;
  channels?: string[];
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxBufferSize?: number;
}

export const useWebSocket = (urlOrOptions?: string | UseWebSocketOptions) => {
  const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bufferedCount, setBufferedCount] = useState(0);
  const clientRef = useRef<ResilientWebSocketClient | null>(null);

  const sendMessage = useCallback((type: string, data: unknown) => {
    const client = clientRef.current;
    if (!client) return;
    client.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    setBufferedCount(client.getBufferedCount());
  }, []);

  const subscribe = useCallback((channel: string) => {
    clientRef.current?.subscribe(channel);
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    clientRef.current?.unsubscribe(channel);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup = () => {};
    const initialize = async () => {
      const token = options.token ?? (await getStoredSessionToken());
      if (!token || !active) return;

      const url = options.url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
      const client = getWebSocketClient({
        url,
        ...(options.heartbeatIntervalMs !== undefined
          ? { heartbeatInterval: options.heartbeatIntervalMs }
          : {}),
        ...(options.heartbeatTimeoutMs !== undefined
          ? { heartbeatTimeout: options.heartbeatTimeoutMs }
          : {}),
        ...(options.maxReconnectAttempts !== undefined
          ? { maxReconnectAttempts: options.maxReconnectAttempts }
          : {}),
        ...(options.baseReconnectDelayMs !== undefined
          ? { reconnectBaseDelay: options.baseReconnectDelayMs }
          : {}),
        ...(options.maxReconnectDelayMs !== undefined
          ? { reconnectMaxDelay: options.maxReconnectDelayMs }
          : {}),
        ...(options.maxBufferSize !== undefined ? { maxBufferSize: options.maxBufferSize } : {}),
      });
      clientRef.current = client;

      const toConnectionStatus = (nextStatus: string): ConnectionStatus => {
        if (nextStatus === 'open') return 'connected';
        if (nextStatus === 'connecting') return 'connecting';
        if (nextStatus === 'reconnecting') return 'reconnecting';
        return 'disconnected';
      };
      const unsubscribeStatus = client.on('status', (nextStatus) => {
        const nextConnectionStatus = toConnectionStatus(nextStatus);
        setStatus(nextConnectionStatus);
        setIsConnected(nextConnectionStatus === 'connected');
      });
      const unsubscribeMessage = client.on('message', (data, event) => {
        let parsed: unknown = data;
        if (typeof data === 'string') {
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
        }
        const message =
          parsed && typeof parsed === 'object' ? (parsed as Partial<WebSocketMessage>) : {};
        setLastMessage({
          type: typeof message.type === 'string' ? message.type : 'message',
          data: 'data' in message ? message.data : parsed,
          timestamp:
            typeof message.timestamp === 'string' ? message.timestamp : event.timeStamp.toString(),
        });
        setBufferedCount(client.getBufferedCount());
      });
      const unsubscribeError = client.on('error', (event) => {
        setError(event instanceof Error ? event.message : 'WebSocket connection failed');
      });

      options.channels?.forEach((channel) => client.subscribe(channel));
      const connectIfAllowed = () => {
        if (options.preventDuplicateTabs) {
          if (getSessionBroadcastManager().isLeader()) {
            client.connect();
          } else {
            client.disconnect();
          }
        } else if (options.autoConnect ?? true) {
          client.connect();
        }
      };
      connectIfAllowed();

      let unsubscribeLeadership: (() => void) | undefined;
      if (options.preventDuplicateTabs) {
        unsubscribeLeadership = getSessionBroadcastManager().onLeadershipChange((isLeader) => {
          if (isLeader) client.connect();
          else client.disconnect();
        });
      }

      cleanup = () => {
        unsubscribeStatus();
        unsubscribeMessage();
        unsubscribeError();
        unsubscribeLeadership?.();
        clientRef.current = null;
      };
    };

    initialize().catch((storageError) => {
      if (active) {
        console.error('Failed to retrieve encrypted WebSocket session token:', storageError);
        setError('Failed to retrieve session credentials.');
      }
    });

    return () => {
      active = false;
      cleanup();
    };
  }, [
    options.token,
    options.url,
    options.autoConnect,
    options.preventDuplicateTabs,
    options.channels?.join(','),
    options.heartbeatIntervalMs,
    options.heartbeatTimeoutMs,
    options.maxReconnectAttempts,
    options.baseReconnectDelayMs,
    options.maxReconnectDelayMs,
    options.maxBufferSize,
  ]);

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
