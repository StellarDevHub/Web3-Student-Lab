/**
 * Cross-tab session synchronization service using BroadcastChannel API
 * with clean fallback to localStorage events for unsupported browsers.
 *
 * Implements tab leadership election to prevent duplicate WebSocket
 * connections across open browser tabs.
 */

export type SyncEventType =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_TOKEN_EXPIRED'
  | 'WALLET_CONNECTED'
  | 'WALLET_DISCONNECTED'
  | 'ACTIVE_COURSE_SELECTED'
  | 'LEADER_CLAIM'
  | 'LEADER_HEARTBEAT'
  | 'LEADER_RESIGN';

export interface SyncMessage<T = any> {
  type: SyncEventType;
  payload: T;
  tabId: string;
  timestamp: number;
}

export type SyncHandler<T = any> = (payload: T, message: SyncMessage<T>) => void;

const CHANNEL_NAME = 'web3_student_lab_session_sync';
const STORAGE_FALLBACK_KEY = '__web3_session_sync_broadcast__';
const HEARTBEAT_INTERVAL_MS = 2000;
const LEADER_TIMEOUT_MS = 5000;

class SessionBroadcastManager {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private listeners: Map<SyncEventType, Set<SyncHandler>> = new Map();
  private isLeaderTab = false;
  private leaderId: string | null = null;
  private lastLeaderHeartbeat = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private leadershipCallbacks: Set<(isLeader: boolean) => void> = new Set();
  private isClosed = false;

  constructor() {
    this.tabId = this.generateTabId();
    this.initTransport();
    this.initLeadershipElection();
  }

  private generateTabId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private initTransport(): void {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          this.handleIncomingMessage(event.data);
        };
      } catch {
        this.initStorageFallback();
      }
    } else {
      this.initStorageFallback();
    }

    window.addEventListener('beforeunload', () => {
      this.close();
    });
  }

  private initStorageFallback(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== STORAGE_FALLBACK_KEY || !event.newValue) return;
      try {
        const msg: SyncMessage = JSON.parse(event.newValue);
        if (msg.tabId !== this.tabId) {
          this.handleIncomingMessage(msg);
        }
      } catch {
        // Ignore unparseable storage payloads
      }
    });
  }

  private initLeadershipElection(): void {
    if (typeof window === 'undefined') return;

    this.claimLeadership();

    this.watchdogTimer = setInterval(() => {
      if (this.isLeaderTab) {
        return;
      }
      const now = Date.now();
      if (!this.leaderId || now - this.lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
        this.claimLeadership();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private claimLeadership(): void {
    if (this.isClosed) return;
    this.setLeadership(true);
    this.leaderId = this.tabId;
    this.lastLeaderHeartbeat = Date.now();
    this.broadcastInternal('LEADER_CLAIM', { tabId: this.tabId });

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.isLeaderTab && !this.isClosed) {
        this.broadcastInternal('LEADER_HEARTBEAT', { tabId: this.tabId });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private setLeadership(status: boolean): void {
    if (this.isLeaderTab !== status) {
      this.isLeaderTab = status;
      this.leadershipCallbacks.forEach((cb) => {
        try {
          cb(status);
        } catch {}
      });
    }
  }

  private handleIncomingMessage(msg: SyncMessage): void {
    if (!msg || msg.tabId === this.tabId) return;

    if (msg.type === 'LEADER_CLAIM') {
      if (this.isLeaderTab) {
        // Conflict resolution: oldest tabId or lexical order
        if (msg.tabId < this.tabId) {
          this.setLeadership(false);
          this.leaderId = msg.tabId;
          this.lastLeaderHeartbeat = Date.now();
          if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
          }
        }
      } else {
        this.leaderId = msg.tabId;
        this.lastLeaderHeartbeat = Date.now();
      }
    } else if (msg.type === 'LEADER_HEARTBEAT') {
      this.leaderId = msg.tabId;
      this.lastLeaderHeartbeat = Date.now();
    } else if (msg.type === 'LEADER_RESIGN') {
      if (this.leaderId === msg.tabId) {
        this.leaderId = null;
        this.claimLeadership();
      }
    }

    const typeListeners = this.listeners.get(msg.type);
    if (typeListeners) {
      typeListeners.forEach((handler) => {
        try {
          handler(msg.payload, msg);
        } catch {}
      });
    }
  }

  private broadcastInternal<T>(type: SyncEventType, payload: T): void {
    if (typeof window === 'undefined') return;

    const message: SyncMessage<T> = {
      type,
      payload,
      tabId: this.tabId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        this.broadcastViaStorage(message);
      }
    } else {
      this.broadcastViaStorage(message);
    }
  }

  private broadcastViaStorage<T>(message: SyncMessage<T>): void {
    try {
      localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(message));
    } catch {}
  }

  public broadcast<T>(type: SyncEventType, payload: T): void {
    this.broadcastInternal(type, payload);
  }

  public on<T = any>(type: SyncEventType, handler: SyncHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const set = this.listeners.get(type)!;
    set.add(handler as SyncHandler);

    return () => {
      set.delete(handler as SyncHandler);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  public onLeadershipChange(callback: (isLeader: boolean) => void): () => void {
    this.leadershipCallbacks.add(callback);
    callback(this.isLeaderTab);
    return () => {
      this.leadershipCallbacks.delete(callback);
    };
  }

  public isLeader(): boolean {
    return this.isLeaderTab;
  }

  public getTabId(): string {
    return this.tabId;
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.isLeaderTab) {
      this.broadcastInternal('LEADER_RESIGN', { tabId: this.tabId });
    }

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);

    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }

    this.listeners.clear();
    this.leadershipCallbacks.clear();
  }
}

let sessionBroadcastSingleton: SessionBroadcastManager | null = null;

export function getSessionBroadcastManager(): SessionBroadcastManager {
  if (!sessionBroadcastSingleton) {
    sessionBroadcastSingleton = new SessionBroadcastManager();
  }
  return sessionBroadcastSingleton;
}
