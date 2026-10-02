import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StorageViewer,
  computeStorageDiff,
  DEFAULT_MOCK_BEFORE_STORAGE,
  DEFAULT_MOCK_AFTER_STORAGE,
  DEFAULT_MOCK_SNAPSHOTS,
  type ContractStorageState,
} from '../StorageViewer';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('computeStorageDiff algorithm', () => {
  it('correctly categorizes added, modified, deleted, and unchanged keys', () => {
    const before: ContractStorageState = {
      instance: [
        { key: 'Key1', keyType: 'Symbol', category: 'instance', value: 100, sizeBytes: 32 },
        { key: 'Key2', keyType: 'Symbol', category: 'instance', value: 'old', sizeBytes: 32 },
      ],
      persistent: [
        { key: 'Key3', keyType: 'Symbol', category: 'persistent', value: true, sizeBytes: 16 },
      ],
    };

    const after: ContractStorageState = {
      instance: [
        { key: 'Key1', keyType: 'Symbol', category: 'instance', value: 100, sizeBytes: 32 }, // unchanged
        { key: 'Key2', keyType: 'Symbol', category: 'instance', value: 'new', sizeBytes: 32 }, // modified
        { key: 'Key4', keyType: 'Symbol', category: 'instance', value: 999, sizeBytes: 32 }, // added
      ],
      persistent: [], // Key3 deleted
    };

    const diffs = computeStorageDiff(before, after);

    const key1 = diffs.find((d) => d.key === 'Key1');
    const key2 = diffs.find((d) => d.key === 'Key2');
    const key3 = diffs.find((d) => d.key === 'Key3');
    const key4 = diffs.find((d) => d.key === 'Key4');

    expect(key1?.mutation).toBe('unchanged');
    expect(key2?.mutation).toBe('modified');
    expect(key3?.mutation).toBe('deleted');
    expect(key4?.mutation).toBe('added');
  });
});

describe('StorageViewer component', () => {
  it('renders the inspector heading and metadata', () => {
    render(<StorageViewer contractId="CA_TEST_CONTRACT_123" />);

    expect(screen.getByText(/Soroban State Diff Inspector/i)).toBeDefined();
    expect(screen.getByText('CA_TEST_CONTRACT_123')).toBeDefined();
    expect(screen.getByText(/FE-HARD-20/i)).toBeDefined();
  });

  it('renders summary statistics metrics', () => {
    render(<StorageViewer />);

    expect(screen.getByText(/Total Keys:/i)).toBeDefined();
    expect(screen.getByText(/Added:/i)).toBeDefined();
    expect(screen.getByText(/Modified:/i)).toBeDefined();
    expect(screen.getByText(/Deleted:/i)).toBeDefined();
  });

  it('renders side-by-side columns by default', () => {
    render(<StorageViewer />);

    expect(screen.getByText(/Before Invocation \(Baseline State\)/i)).toBeDefined();
    expect(screen.getByText(/After Invocation \(Mutated State\)/i)).toBeDefined();
  });

  it('filters storage by search query', () => {
    render(<StorageViewer />);

    const searchInput = screen.getByLabelText(/filter storage by key/i);
    fireEvent.change(searchInput, { target: { value: 'TotalSupply' } });

    expect(screen.getByText('TotalSupply')).toBeDefined();
  });

  it('filters storage by category tab', () => {
    render(<StorageViewer />);

    const instanceBtn = screen.getByRole('button', { name: /^instance$/i });
    fireEvent.click(instanceBtn);

    expect(screen.getByText('Admin')).toBeDefined();
    expect(screen.getByText('TotalSupply')).toBeDefined();
  });

  it('filters storage by mutation type tab', () => {
    render(<StorageViewer />);

    const addedBtn = screen.getByRole('button', { name: /^added$/i });
    fireEvent.click(addedBtn);

    // Added keys should be visible
    const addedBadges = screen.getAllByText(/\+ ADDED/i);
    expect(addedBadges.length).toBeGreaterThan(0);
  });

  it('switches between view modes (Unified Diff and JSON Tree)', () => {
    render(<StorageViewer />);

    // Switch to Unified Diff
    const unifiedBtn = screen.getByRole('button', { name: /unified diff/i });
    fireEvent.click(unifiedBtn);
    expect(screen.getByRole('button', { name: /unified diff/i })).toBeDefined();

    // Switch to JSON Tree
    const treeBtn = screen.getByRole('button', { name: /json tree/i });
    fireEvent.click(treeBtn);
    expect(screen.getByText(/Full Current Contract Storage Hierarchy/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /copy json tree/i })).toBeDefined();
  });

  it('handles time-travel ledger rollback when clicking timeline node', async () => {
    const onRollback = vi.fn();
    render(<StorageViewer onRollback={onRollback} />);

    // Click first snapshot node (Initial Contract Deployment Seq #1048575)
    const initialSnapNode = screen.getByText('Initial Contract Deployment');
    fireEvent.click(initialSnapNode);

    expect(onRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: 1048575,
        label: 'Initial Contract Deployment',
      }),
      1048575
    );

    // Check rollback alert is rendered
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText(/State successfully rewound to Ledger #1048575/i)).toBeDefined();
    });
  });

  it('handles time-travel rewind and forward buttons', () => {
    const onRollback = vi.fn();
    render(<StorageViewer onRollback={onRollback} />);

    const rewindBtn = screen.getByRole('button', { name: /< rewind/i });
    fireEvent.click(rewindBtn);

    expect(onRollback).toHaveBeenCalled();
  });

  it('handles manual snapshot creation', () => {
    render(<StorageViewer />);

    const snapBtn = screen.getByRole('button', { name: /snapshot/i });
    fireEvent.click(snapBtn);

    expect(screen.getByText(/checkpoints recorded/i)).toBeDefined();
  });

  it('handles exporting JSON state', () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const el = originalCreateElement('a');
        el.click = clickSpy;
        return el;
      }
      return originalCreateElement(tagName);
    });

    render(<StorageViewer />);

    const exportBtn = screen.getByRole('button', { name: /export json/i });
    fireEvent.click(exportBtn);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('copies data to clipboard', async () => {
    render(<StorageViewer />);

    const copyButtons = screen.getAllByTitle(/copy/i);
    if (copyButtons.length > 0) {
      await waitFor(() => {
        fireEvent.click(copyButtons[0]);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    }
  });

  it('calls onKeySelect when clicking a row', () => {
    const onKeySelect = vi.fn();
    render(<StorageViewer onKeySelect={onKeySelect} />);

    const adminKey = screen.getByText('Admin');
    fireEvent.click(adminKey);

    expect(onKeySelect).toHaveBeenCalledWith('Admin', expect.anything());
  });
});
