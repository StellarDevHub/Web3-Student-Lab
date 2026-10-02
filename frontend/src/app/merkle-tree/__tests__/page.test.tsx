import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import MerkleTreePage from '../page';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('merkle-tree Proof Studio (FE-HARD-27)', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a SHA-256 tree from leaf input and renders it on canvas', async () => {
    const { container } = render(<MerkleTreePage />);

    expect(screen.getByRole('heading', { name: /merkle proof studio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/leaf values/i)).toBeInTheDocument();

    // Tree builds on mount; root hash (64 hex chars shown short) appears.
    await screen.findByText(/depth 3 · 6 leaves/i);

    const canvas = screen.getByRole('img', { name: /merkle tree visualization/i });
    expect(canvas).toBeInTheDocument();

    // Promotion (not duplication) means one L1 node is carried up as a copy:
    // root + 2 × L2 + 2 × L1 + 6 leaves = 11 nodes reachable on the canvas.
    expect(container.querySelectorAll('circle').length).toBe(11);
  });

  it('observes canvas resizes and re-lays out the tree', async () => {
    render(<MerkleTreePage />);
    await screen.findByText(/depth 3 · 6 leaves/i);

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0].observe).toHaveBeenCalled();

    // Simulate the container growing; the observer callback feeds the width
    // back into the D3 layout via state.
    const instance = MockResizeObserver.instances[0];
    instance.callback(
      [{ contentRect: { width: 1200 } } as ResizeObserverEntry],
      instance as unknown as ResizeObserver
    );

    await waitFor(() => {
      const svg = screen.getByRole('img', { name: /merkle tree visualization/i });
      expect(svg.getAttribute('viewBox')).toBe('0 0 1200 480');
    });
  });

  it('generates and verifies an inclusion proof when a leaf is clicked', async () => {
    const { container } = render(<MerkleTreePage />);
    await screen.findByText(/depth 3 · 6 leaves/i);

    // D3 lays out breadth-first: the last 6 circles are the leaves.
    const circles = container.querySelectorAll('circle');
    fireEvent.click(circles[circles.length - 6]);

    await screen.findByRole('region', { name: /inclusion proof/i });
    expect(await screen.findByText(/leaf hash — sha-256/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all/i }));
    expect(await screen.findByText(/verified — reconstructed root matches/i)).toBeInTheDocument();

    // Export control is part of proof generation UX.
    expect(screen.getByRole('button', { name: /export json test vector/i })).toBeInTheDocument();
  });

  it('rejects a non-member value against the same root', async () => {
    const { container } = render(<MerkleTreePage />);
    await screen.findByText(/depth 3 · 6 leaves/i);

    const circles = container.querySelectorAll('circle');
    fireEvent.click(circles[circles.length - 6]);
    await screen.findByText(/leaf hash — sha-256/i);

    fireEvent.change(screen.getByLabelText(/value to verify/i), {
      target: { value: 'mallory' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(await screen.findByText(/is NOT in the tree/i)).toBeInTheDocument();
  });

  it('rebuilds the tree from edited leaves', async () => {
    render(<MerkleTreePage />);
    await screen.findByText(/depth 3 · 6 leaves/i);

    fireEvent.change(screen.getByLabelText(/leaf values/i), {
      target: { value: 'solo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /build tree/i }));

    await screen.findByText(/depth 0 · 1 leaves/i);
  });
});
