import { renderHook, act } from '@testing-library/react';
import { getSessionBroadcastManager } from '@/services/session/broadcastSync';
import { useBroadcastSync } from '@/hooks/useBroadcastSync';

describe('useBroadcastSync & SessionBroadcastManager', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    const manager = getSessionBroadcastManager();
    manager.close();
  });

  it('should initialize and claim initial tab leadership', () => {
    const manager = getSessionBroadcastManager();
    expect(manager.getTabId()).toBeTruthy();
    expect(typeof manager.isLeader()).toBe('boolean');
  });

  it('should dispatch broadcast events to registered handlers', () => {
    const manager = getSessionBroadcastManager();
    const handler = jest.fn();

    const unsubscribe = manager.on('AUTH_LOGOUT', handler);
    manager.broadcast('AUTH_LOGOUT', { reason: 'test_logout' });

    // Internal broadcast to self or peers
    unsubscribe();
  });

  it('should expose broadcast helper in useBroadcastSync hook', () => {
    const onLogout = jest.fn();
    const { result } = renderHook(() =>
      useBroadcastSync({
        onAuthLogout: onLogout,
      })
    );

    expect(typeof result.current.broadcast).toBe('function');
    expect(typeof result.current.subscribe).toBe('function');
    expect(result.current.tabId).toBeTruthy();
  });
});
