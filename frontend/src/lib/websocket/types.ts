export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface BufferedMessage extends WebSocketMessage {
  id: string;
  attempts: number;
}

export interface Subscription {
  channel: string;
  payload?: Record<string, unknown>;
}

export interface WebSocketClientOptions {
  url?: string;
  token?: string | null;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxBufferSize?: number;
  autoConnect?: boolean;
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type ErrorHandler = (error: Error) => void;

export interface WebSocketClientState {
  status: ConnectionStatus;
  attempts: number;
  bufferedCount: number;
  lastError: string | null;
}
