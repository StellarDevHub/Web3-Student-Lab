import { EventEmitter } from 'events';

export type WebSocketStatus = 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';

export interface WebSocketClientOptions {
  /** URI of the WebSocket endpoint. */
  url: string;
  /** Protocols to pass to the WebSocket constructor. */
  protocols?: string | string[];
  /** Interval between heartbeat pings in ms. Defaults to 30000. */
  heartbeatInterval?: number;
  /** Time to wait for a pong before considering the socket dead, in ms. Defaults to 10000. */
  heartbeatTimeout?: number;
  /** Base delay for exponential reconnect backoff in ms. Defaults to 1000. */
  reconnectBaseDelay?: number;
  /** Maximum delay for exponential reconnect backoff in ms. Defaults to 30000. */
  reconnectMaxDelay?: number;
  /** Maximum number of buffered messages. Defaults to 1000. */
  maxBufferSize?: number;
  /** Maximum number of reconnect attempts. Defaults to Infinity. */
  maxReconnectAttempts?: number;
  /** Optional factory to create the underlying WebSocket (useful for testing). */
  webSocketFactory?: (url: string, protocols?: string | string[]) => WebSocket;
}

export interface WebSocketClientEvents {
  open: () => void;
  close: (event: CloseEvent) => void;
  error: (event: Event) => void;
  message: (data: unknown, event: MessageEvent) => void;
  status: (status: WebSocketStatus) => void;
  reconnecting: (attempt: number, delay: number) => void;
  reconnected: (attempt: number) => void;
}

export type WebSocketClientEventName = keyof WebSocketClientEvents;

interface BufferedMessage {
  data: string | ArrayBuffer | Blob | ArrayBufferView;
  timestamp: number;
}

const DEFAULT_HEARTBEAT_INTERVAL = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT = 10_000;
const DEFAULT_RECONNECT_BASE_DELAY = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY = 30_000;
const DEFAULT_MAX_BUFFER_SIZE = 1_000;

export class ResilientWebSocketClient {
  private readonly options: Required<WebSocketClientOptions>;
  private readonly emitter = new EventEmitter();
  private socket: WebSocket | null = null;
  private status: WebSocketStatus = 'closed';
  private buffer: BufferedMessage[] = [];
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private connecting = false;

  constructor(options: WebSocketClientOptions) {
    this.options = {
      heartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL,
      heartbeatTimeout: DEFAULT_HEARTBEAT_TIMEOUT,
      reconnectBaseDelay: DEFAULT_RECONNECT_BASE_DELAY,
      reconnectMaxDelay: DEFAULT_RECONNECT_MAX_DELAY,
      maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
      maxReconnectAttempts: Number.POSITIVE_INFINITY,
      webSocketFactory: (url, protocols) => new WebSocket(url, protocols),
      ...options,
    };
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  getBufferedCount(): number {
    return this.buffer.length;
  }

  on<E unknown Extends WebSocketClientEventName>(
    event: E,
    handler: WebSocketClientEvents[E],
  ): () => void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(event, handler as (...args: unknown[]) => void);
    };
  }

  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (this.connecting) {
      return;
    }
    this.manualClose = false;
    this.connecting = true;
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    let socket: WebSocket;
    try {
      socket = this.options.webSocketFactory(this.options.url, this.options.protocols);
    } catch (error) {
      this.connecting = false;
      this.setStatus('closed');
      this.emitter.emit('error', error as Event);
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.connecting = false;
      const wasReconnecting = this.reconnectAttempts > 0;
      const attempts = this.reconnectAttempts;
      this.reconnectAttempts = 0;
      this.setStatus('open');
      this.startHeartbeat();
      this.restoreSubscriptions();
      this.flushBuffer();
      this.emitter.emit('open');
      if (wasReconnecting) {
        this.emitter.emit('reconnected', attempts);
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data === 'string' && this.isPong(data)) {
        this.clearPongTimeout();
        return;
      }
      this.emitter.emit('message', data, event);
    };

    socket.onclose = (event: CloseEvent) => {
      this.connecting = false;
      this.stopHeartbeat();
      this.socket = null;
      this.setStatus('closed');
      this.emitter.emit('close', event);
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = (event: Event) => {
      this.emitter.emit('error', event);
    };
  }

  disconnect(code = 1000, reason = 'client disconnect'): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.socket) {
      this.setStatus('closing');
      try {
        this.socket.close(code, reason);
      } catch {
        /* ignore close errors */
      }
    }
  }

 send(data: string | ArrayBuffer | Blob | ArrayBufferView): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data as any);
      return true;
    }
    this.bufferMessage(data);
    if (!this.socket) {
      this.connect();
    }
    return false;
  }

  subscribe(channel: string): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.add(channel);
    }
    this.send(JSON.stringify({ type: 'subscribe', channel }));
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.send(JSON.stringify({ type: 'unsubscribe', channel }));
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  private bufferMessage(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    this.buffer.push({ data, timestamp: Date.now() });
    if (this.buffer.length > this.options.maxBufferSize) {
      this.buffer.shift();
    }
  }

  private flushBuffer(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const pending = this.buffer;
    this.buffer = [];
    for (const message of pending) {
      try {
        this.socket.send(message.data as any);
      } catch {
        this.buffer.push(message);
      }
    }
  }

  private restoreSubscriptions(): void {
    for (const channel of this.subscriptions) {
      this.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose) {
      return;
    }
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return;
    }
    this.clearReconnectTimer();
    const attempt = this.reconnectAttempts + 1;
    const delay = Math.min(
      this.options.reconnectBaseDelay * 2 ** (attempt - 1),
      this.options.reconnectMaxDelay,
    );
    this.reconnectAttempts = attempt;
    this.setStatus('reconnecting');
    this.emitter.emit('reconnecting', attempt, delay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearPongTimeout();
  }

  private sendPing(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.socket.send(JSON.stringify({ type: 'ping' }));
    } catch {
      return;
    }
    this.clearPongTimeout();
    this.pongTimeoutTimer = setTimeout(() => {
      this.pongTimeoutTimer = null;
      if (this.socket) {
        try {
          this.socket.close(4000, 'heartbeat timeout');
        } catch {
          /* ignore */
        }
      }
    }, this.options.heartbeatTimeout);
  }

  private clearPongTimeout(): void {
    if (this.pongTimeoutTimer !== null) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  private isPong(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null && parsed.type === 'pong';
    } catch {
      return data === 'pong';
    }
  }

  private setStatus(status: WebSocketStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.emitter.emit('status', status);
  }
}

/** Singleton registry */
const instances = new Map<string, ResilientWebSocketClient>();

export function getWebSocketClient(options: WebSocketClientOptions): ResilientWebSocketClient {
  const key = options.url;
  let instance = instances.get(key);
  if (!instance) {
    instance = new ResilientWebSocketClient(options);
    instances.set(key, instance);
  }
  return instance;
}

export function resetWebSocketClient(url?: string): void {
  if (url) {
    const instance = instances.get(url);
    if (instance) {
      instance.disconnect();
      instances.delete(url);
    }
    return;
  }
  for (const instance of instances.values()) {
    instance.disconnect();
  }
  instances.clear();
}
