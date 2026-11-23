import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { OfflineIndicator, useOnlineStatus } from '../OfflineIndicator';
import { flushOfflineSyncQueue, getPendingSyncCount } from '@/lib/offline-sync';
import { requestBackgroundSync } from '@/lib/service-worker-sync';

vi.mock('@/lib/offline-sync', () => ({
  flushOfflineSyncQueue: vi.fn().mockResolvedValue(undefined),
  getPendingSyncCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/lib/service-worker-sync', () => ({
  requestBackgroundSync: vi.fn().mockResolvedValue(true),
}));

function TestOnlineStatusProbe() {
  const isOnline = useOnlineStatus();
  return <span data-testid="online-probe">{isOnline ? 'online' : 'offline'}</span>;
}

describe('OfflineIndicator engine (FE-HARD-34)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPendingSyncCount).mockResolvedValue(0);
  });

  it('tracks navigator.onLine via online/offline events', () => {
    render(<TestOnlineStatusProbe />);
    expect(screen.getByTestId('online-probe')).toHaveTextContent('online');

    fireEvent(window, new Event('offline'));
    expect(screen.getByTestId('online-probe')).toHaveTextContent('offline');

    fireEvent(window, new Event('online'));
    expect(screen.getByTestId('online-probe')).toHaveTextContent('online');
  });

  it('shows the offline alert banner with the queued-action count', async () => {
    vi.mocked(getPendingSyncCount).mockResolvedValue(3);
    render(<OfflineIndicator />);

    fireEvent(window, new Event('offline'));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/offline mode/i);
    expect(banner).toHaveTextContent(/3 actions queued/i);
    expect(screen.getByRole('status')).toHaveTextContent(/offline mode/i);
  });

  it('flushes the queue and arms Background Sync upon reconnection', async () => {
    render(<OfflineIndicator />);

    fireEvent(window, new Event('offline'));
    await screen.findByRole('alert');

    fireEvent(window, new Event('online'));

    await waitFor(() => {
      expect(flushOfflineSyncQueue).toHaveBeenCalled();
      expect(requestBackgroundSync).toHaveBeenCalled();
    });
    expect(await screen.findByText(/online/i)).toBeInTheDocument();
  });

  it('manual Sync now replays the queue', async () => {
    render(<OfflineIndicator />);
    await waitFor(() => expect(getPendingSyncCount).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(flushOfflineSyncQueue).toHaveBeenCalledTimes(1);
    });
  });

  it('stays externally driven when props are provided', async () => {
    const onManualSync = vi.fn();
    render(
      <OfflineIndicator
        isOnline={false}
        syncState="error"
        pendingCount={5}
        onManualSync={onManualSync}
      />
    );

    // Banner still appears (Medium), but the engine never flushes itself.
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 actions queued/i);
    expect(screen.getByRole('status')).toHaveTextContent(/sync: error/i);

    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));
    expect(onManualSync).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event('online'));
    await waitFor(() => {
      expect(flushOfflineSyncQueue).not.toHaveBeenCalled();
    });
  });
});
