/**
 * OfflineBanner tests — FE-070
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfflineBanner } from '../OfflineBanner';
import type { SyncConflict } from '@/lib/storage/SyncManager';

function makeConflict(path = '/test.sol'): SyncConflict {
  return {
    path,
    local: {
      id: 'local-id',
      path,
      content: 'local line 1\nlocal line 2',
      lamport: 2,
      vectorClock: { dev1: 2 },
      createdAt: Date.now(),
      pending: true,
    },
    remote: {
      path,
      content: 'remote line 1\nremote line 2',
      lamport: 5,
      vectorClock: { dev2: 5 },
      updatedAt: Date.now(),
    },
  };
}

const noop = () => {};

describe('OfflineBanner', () => {
  // -------------------------------------------------------------------------
  // Status banner visibility
  // -------------------------------------------------------------------------

  it('renders nothing when online, idle, and no conflicts', () => {
    const { container } = render(
      <OfflineBanner
        isOnline
        syncState="idle"
        conflicts={[]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows offline banner when isOnline is false', () => {
    render(
      <OfflineBanner
        isOnline={false}
        syncState="offline"
        conflicts={[]}
        pendingCount={3}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.getByText(/3 changes queued/i)).toBeInTheDocument();
  });

  it('shows syncing indicator when syncState is syncing', () => {
    render(
      <OfflineBanner
        isOnline
        syncState="syncing"
        conflicts={[]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByText(/syncing changes/i)).toBeInTheDocument();
  });

  it('shows error state with retry button when syncState is error', () => {
    const onRetry = vi.fn();
    render(
      <OfflineBanner
        isOnline
        syncState="error"
        conflicts={[]}
        pendingCount={0}
        onRetrySync={onRetry}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByText(/sync failed/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows conflict count and Review button when conflicts exist', () => {
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByText(/1 conflict detected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeInTheDocument();
  });

  it('dismisses banner when X is clicked', () => {
    render(
      <OfflineBanner
        isOnline={false}
        syncState="offline"
        conflicts={[]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Conflict modal
  // -------------------------------------------------------------------------

  it('opens conflict modal when Review is clicked', () => {
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens conflict modal automatically when conflicts array goes from 0 to 1', () => {
    const { rerender } = render(
      <OfflineBanner
        isOnline
        syncState="idle"
        conflicts={[]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[makeConflict()]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows side-by-side panes with correct labels', () => {
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByText('Your version')).toBeInTheDocument();
    expect(screen.getByText('Their version')).toBeInTheDocument();
  });

  it('calls onResolveConflict with "mine" when Keep my version is clicked', () => {
    const onResolve = vi.fn();
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={onResolve}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep my version/i }));
    expect(onResolve).toHaveBeenCalledWith(conflict, 'mine', undefined);
  });

  it('calls onResolveConflict with "theirs" when Use their version is clicked', () => {
    const onResolve = vi.fn();
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={onResolve}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /use their version/i }));
    expect(onResolve).toHaveBeenCalledWith(conflict, 'theirs', undefined);
  });

  it('allows manual merge editing and resolves with merged content', () => {
    const onResolve = vi.fn();
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={onResolve}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit manually/i }));

    const editor = screen.getByRole('textbox', { name: /merged content editor/i });
    fireEvent.change(editor, { target: { value: 'merged result' } });
    fireEvent.click(screen.getByRole('button', { name: /save merge/i }));

    expect(onResolve).toHaveBeenCalledWith(conflict, 'merged', 'merged result');
  });

  it('calls onDismissConflict when "Decide later" is clicked', () => {
    const onDismiss = vi.fn();
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /decide later/i }));
    expect(onDismiss).toHaveBeenCalledWith(conflict);
  });

  it('shows conflict navigation arrows for multiple conflicts', () => {
    const conflicts = [makeConflict('/a.sol'), makeConflict('/b.sol')];
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={conflicts}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByRole('button', { name: /next conflict/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous conflict/i })).toBeInTheDocument();
  });

  it('closes modal via backdrop click', () => {
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click the backdrop (the dialog element itself).
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes modal via close button', () => {
    const conflict = makeConflict();
    render(
      <OfflineBanner
        isOnline
        syncState="conflict"
        conflicts={[conflict]}
        pendingCount={0}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /close conflict dialog/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows singular "change" for pendingCount of 1', () => {
    render(
      <OfflineBanner
        isOnline={false}
        syncState="offline"
        conflicts={[]}
        pendingCount={1}
        onResolveConflict={noop}
        onDismissConflict={noop}
      />,
    );
    expect(screen.getByText(/1 change queued/i)).toBeInTheDocument();
  });
});
