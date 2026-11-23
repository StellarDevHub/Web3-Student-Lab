import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getSessionBroadcastManager,
  SyncEventType,
  SyncHandler,
  SyncMessage,
} from '@/services/session/broadcastSync';

export interface UseBroadcastSyncOptions {
  onAuthLogin?: SyncHandler<{ user: any; token: string }>;
  onAuthLogout?: SyncHandler<{ reason?: string }>;
  onAuthTokenExpired?: SyncHandler<{ expiredAt: number }>;
  onWalletConnected?: SyncHandler<{ wallet: string; publicKey: string; network?: string }>;
  onWalletDisconnected?: SyncHandler<{ reason?: string }>;
  onActiveCourseSelected?: SyncHandler<{ courseId: string; lessonId?: string }>;
}

export function useBroadcastSync(options?: UseBroadcastSyncOptions) {
  const [isLeader, setIsLeader] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<SyncMessage | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const manager = getSessionBroadcastManager();
    const unsubLeadership = manager.onLeadershipChange((leaderStatus) => {
      setIsLeader(leaderStatus);
    });

    const unsubs: Array<() => void> = [];

    const bind = (type: SyncEventType, callback?: SyncHandler) => {
      const unsub = manager.on(type, (payload, msg) => {
        setLastMessage(msg);
        callback?.(payload, msg);
      });
      unsubs.push(unsub);
    };

    bind('AUTH_LOGIN', (payload, msg) => optionsRef.current?.onAuthLogin?.(payload, msg));
    bind('AUTH_LOGOUT', (payload, msg) => optionsRef.current?.onAuthLogout?.(payload, msg));
    bind('AUTH_TOKEN_EXPIRED', (payload, msg) => optionsRef.current?.onAuthTokenExpired?.(payload, msg));
    bind('WALLET_CONNECTED', (payload, msg) => optionsRef.current?.onWalletConnected?.(payload, msg));
    bind('WALLET_DISCONNECTED', (payload, msg) => optionsRef.current?.onWalletDisconnected?.(payload, msg));
    bind('ACTIVE_COURSE_SELECTED', (payload, msg) => optionsRef.current?.onActiveCourseSelected?.(payload, msg));

    return () => {
      unsubLeadership();
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  const broadcast = useCallback(<T>(type: SyncEventType, payload: T) => {
    const manager = getSessionBroadcastManager();
    manager.broadcast(type, payload);
  }, []);

  const subscribe = useCallback(<T>(type: SyncEventType, handler: SyncHandler<T>) => {
    const manager = getSessionBroadcastManager();
    return manager.on<T>(type, handler);
  }, []);

  return {
    isLeader,
    broadcast,
    subscribe,
    lastMessage,
    tabId: typeof window !== 'undefined' ? getSessionBroadcastManager().getTabId() : '',
  };
}
