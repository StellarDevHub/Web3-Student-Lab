'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Database,
  History,
  RotateCcw,
  Search,
  Filter,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Columns,
  List,
  Sparkles,
  Download,
  Upload,
  ArrowRight,
  FileCode,
  Layers,
  Clock,
  Plus,
  Minus,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type StorageCategory = 'instance' | 'persistent' | 'temporary';
export type MutationType = 'added' | 'modified' | 'deleted' | 'unchanged';
export type ViewMode = 'side-by-side' | 'unified' | 'tree';

export interface StorageEntry {
  key: string;
  keyType: string;
  category: StorageCategory;
  value: any;
  valueType?: string;
  liveUntilLedger?: number;
  sizeBytes?: number;
}

export interface ContractStorageState {
  instance: StorageEntry[];
  persistent: StorageEntry[];
  temporary?: StorageEntry[];
}

export interface StorageDiffItem {
  key: string;
  keyType: string;
  category: StorageCategory;
  mutation: MutationType;
  beforeValue?: any;
  afterValue?: any;
  beforeBytes?: number;
  afterBytes?: number;
  bytesDelta: number;
}

export interface LedgerSnapshot {
  id: string;
  sequence: number;
  timestamp: string;
  label: string;
  methodInvoked?: string;
  txHash?: string;
  storage: ContractStorageState;
}

export interface StorageViewerProps {
  contractId?: string;
  initialStorage?: ContractStorageState;
  beforeStorage?: ContractStorageState;
  afterStorage?: ContractStorageState;
  snapshots?: LedgerSnapshot[];
  onRollback?: (snapshot: LedgerSnapshot, sequence: number) => void;
  onKeySelect?: (key: string, diffItem?: StorageDiffItem) => void;
  readOnly?: boolean;
  className?: string;
}

// ── Default Mock State for Standalone Playground ──────────────────────────────

export const DEFAULT_MOCK_BEFORE_STORAGE: ContractStorageState = {
  instance: [
    {
      key: 'Admin',
      keyType: 'Symbol',
      category: 'instance',
      value: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      valueType: 'Address',
      liveUntilLedger: 1054200,
      sizeBytes: 64,
    },
    {
      key: 'Paused',
      keyType: 'Symbol',
      category: 'instance',
      value: false,
      valueType: 'Bool',
      liveUntilLedger: 1054200,
      sizeBytes: 16,
    },
    {
      key: 'TotalSupply',
      keyType: 'Symbol',
      category: 'instance',
      value: '10000000000',
      valueType: 'I128',
      liveUntilLedger: 1054200,
      sizeBytes: 32,
    },
  ],
  persistent: [
    {
      key: 'Balance:GBBD47IF...LA5',
      keyType: 'Tuple(Symbol, Address)',
      category: 'persistent',
      value: '8500000000',
      valueType: 'I128',
      liveUntilLedger: 1089000,
      sizeBytes: 48,
    },
    {
      key: 'Balance:GCAX26MN...98Z',
      keyType: 'Tuple(Symbol, Address)',
      category: 'persistent',
      value: '1500000000',
      valueType: 'I128',
      liveUntilLedger: 1089000,
      sizeBytes: 48,
    },
    {
      key: 'Allowance:GBBD...->GCAX...',
      keyType: 'Tuple(Symbol, Address, Address)',
      category: 'persistent',
      value: { amount: '500000000', expiration_ledger: 1060000 },
      valueType: 'CustomStruct',
      liveUntilLedger: 1060000,
      sizeBytes: 96,
    },
    {
      key: 'DeprecatedOracleConfig',
      keyType: 'Symbol',
      category: 'persistent',
      value: { heartbeat: 300, threshold: 2 },
      valueType: 'Map',
      liveUntilLedger: 1049000,
      sizeBytes: 72,
    },
  ],
  temporary: [
    {
      key: 'Nonce:GBBD47IF...LA5',
      keyType: 'Tuple(Symbol, Address)',
      category: 'temporary',
      value: 41,
      valueType: 'U32',
      liveUntilLedger: 1048600,
      sizeBytes: 24,
    },
  ],
};

export const DEFAULT_MOCK_AFTER_STORAGE: ContractStorageState = {
  instance: [
    {
      key: 'Admin',
      keyType: 'Symbol',
      category: 'instance',
      value: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      valueType: 'Address',
      liveUntilLedger: 1054200,
      sizeBytes: 64,
    },
    {
      key: 'Paused',
      keyType: 'Symbol',
      category: 'instance',
      value: false,
      valueType: 'Bool',
      liveUntilLedger: 1054200,
      sizeBytes: 16,
    },
    {
      key: 'TotalSupply',
      keyType: 'Symbol',
      category: 'instance',
      value: '10500000000', // MODIFIED (+500M minted)
      valueType: 'I128',
      liveUntilLedger: 1054200,
      sizeBytes: 32,
    },
  ],
  persistent: [
    {
      key: 'Balance:GBBD47IF...LA5',
      keyType: 'Tuple(Symbol, Address)',
      category: 'persistent',
      value: '8000000000', // MODIFIED (-500M transfer)
      valueType: 'I128',
      liveUntilLedger: 1089000,
      sizeBytes: 48,
    },
    {
      key: 'Balance:GCAX26MN...98Z',
      keyType: 'Tuple(Symbol, Address)',
      category: 'persistent',
      value: '2000000000', // MODIFIED (+500M received)
      valueType: 'I128',
      liveUntilLedger: 1089000,
      sizeBytes: 48,
    },
    {
      key: 'Balance:GDTR88OP...31K',
      keyType: 'Tuple(Symbol, Address)',
      category: 'persistent',
      value: '500000000', // ADDED (New account created via mint)
      valueType: 'I128',
      liveUntilLedger: 1089000,
      sizeBytes: 48,
    },
    {
      key: 'Allowance:GBBD...->GCAX...',
      keyType: 'Tuple(Symbol, Address, Address)',
      category: 'persistent',
      value: { amount: '0', expiration_ledger: 1060000 }, // MODIFIED (Allowance consumed)
      valueType: 'CustomStruct',
      liveUntilLedger: 1060000,
      sizeBytes: 96,
    },
    // DeprecatedOracleConfig was DELETED
  ],
  temporary: [
    {
      key: 'Nonce:GBBD47IF...LA5',
      keyType: 'Tuple(Symbol, Address)',
      category: 'temporary',
      value: 42, // MODIFIED (Nonce incremented)
      valueType: 'U32',
      liveUntilLedger: 1048600,
      sizeBytes: 24,
    },
    {
      key: 'ReentrancyGuard:Locked',
      keyType: 'Symbol',
      category: 'temporary',
      value: false, // ADDED
      valueType: 'Bool',
      liveUntilLedger: 1048600,
      sizeBytes: 16,
    },
  ],
};

export const DEFAULT_MOCK_SNAPSHOTS: LedgerSnapshot[] = [
  {
    id: 'snap-1048575',
    sequence: 1048575,
    timestamp: '2026-09-30 02:40:00 UTC',
    label: 'Initial Contract Deployment',
    methodInvoked: '__init(admin, supply)',
    txHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    storage: {
      instance: DEFAULT_MOCK_BEFORE_STORAGE.instance.map((e) =>
        e.key === 'TotalSupply' ? { ...e, value: '10000000000' } : e
      ),
      persistent: DEFAULT_MOCK_BEFORE_STORAGE.persistent.filter((e) =>
        e.key !== 'Allowance:GBBD...->GCAX...'
      ),
      temporary: [],
    },
  },
  {
    id: 'snap-1048576',
    sequence: 1048576,
    timestamp: '2026-09-30 02:45:12 UTC',
    label: 'Approve Spender Allowance',
    methodInvoked: 'approve(spender, amount)',
    txHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    storage: DEFAULT_MOCK_BEFORE_STORAGE,
  },
  {
    id: 'snap-1048577',
    sequence: 1048577,
    timestamp: '2026-09-30 02:50:30 UTC',
    label: 'Transfer & Mint Execution',
    methodInvoked: 'transfer_from(from, to, amount)',
    txHash: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
    storage: DEFAULT_MOCK_AFTER_STORAGE,
  },
];

// ── Diff Calculation Utility ──────────────────────────────────────────────────

export function computeStorageDiff(
  before: ContractStorageState,
  after: ContractStorageState
): StorageDiffItem[] {
  const diffs: StorageDiffItem[] = [];
  const categories: StorageCategory[] = ['instance', 'persistent', 'temporary'];

  for (const cat of categories) {
    const beforeList = before[cat] || [];
    const afterList = after[cat] || [];

    const beforeMap = new Map<string, StorageEntry>();
    for (const item of beforeList) {
      beforeMap.set(item.key, item);
    }

    const afterMap = new Map<string, StorageEntry>();
    for (const item of afterList) {
      afterMap.set(item.key, item);
    }

    // Process all after keys (Added or Modified or Unchanged)
    for (const [key, afterEntry] of afterMap.entries()) {
      const beforeEntry = beforeMap.get(key);
      const afterBytes = afterEntry.sizeBytes || 32;

      if (!beforeEntry) {
        diffs.push({
          key,
          keyType: afterEntry.keyType,
          category: cat,
          mutation: 'added',
          afterValue: afterEntry.value,
          afterBytes,
          bytesDelta: afterBytes,
        });
      } else {
        const beforeBytes = beforeEntry.sizeBytes || 32;
        const isModified =
          JSON.stringify(beforeEntry.value) !== JSON.stringify(afterEntry.value);

        diffs.push({
          key,
          keyType: afterEntry.keyType,
          category: cat,
          mutation: isModified ? 'modified' : 'unchanged',
          beforeValue: beforeEntry.value,
          afterValue: afterEntry.value,
          beforeBytes,
          afterBytes,
          bytesDelta: afterBytes - beforeBytes,
        });
      }
    }

    // Process deleted keys (In before but not in after)
    for (const [key, beforeEntry] of beforeMap.entries()) {
      if (!afterMap.has(key)) {
        const beforeBytes = beforeEntry.sizeBytes || 32;
        diffs.push({
          key,
          keyType: beforeEntry.keyType,
          category: cat,
          mutation: 'deleted',
          beforeValue: beforeEntry.value,
          beforeBytes,
          bytesDelta: -beforeBytes,
        });
      }
    }
  }

  return diffs;
}

// ── JSON Syntax & Tree Formatter Component ─────────────────────────────────────

function JsonValueTree({
  value,
  depth = 0,
  glowClass,
}: {
  value: any;
  depth?: number;
  glowClass?: string;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  if (value === null || value === undefined) {
    return <span className="font-mono text-zinc-500 italic">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={cn('font-mono font-bold', value ? 'text-emerald-400' : 'text-rose-400')}>
        {value.toString()}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-cyan-300">{value}</span>;
  }

  if (typeof value === 'string') {
    // Detect Stellar Addresses / Hashes
    const isAddress = value.startsWith('G') && value.length >= 30;
    const isHash = /^[a-fA-F0-9]{64}$/.test(value);

    return (
      <span
        className={cn(
          'font-mono break-all',
          isAddress
            ? 'text-indigo-300 font-semibold underline decoration-indigo-500/30'
            : isHash
            ? 'text-purple-300 font-mono text-[11px]'
            : 'text-amber-300'
        )}
      >
        "{value}"
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="font-mono text-zinc-400">[]</span>;
    }

    return (
      <div className="inline-block">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-white"
          aria-label={collapsed ? 'Expand array' : 'Collapse array'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>Array({value.length})</span>
        </button>
        {!collapsed && (
          <div className="pl-4 border-l border-zinc-800 my-1 space-y-1">
            {value.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="font-mono text-zinc-600 select-none text-[11px]">{idx}:</span>
                <JsonValueTree value={item} depth={depth + 1} glowClass={glowClass} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return <span className="font-mono text-zinc-400">{'{}'}</span>;
    }

    return (
      <div className="inline-block w-full">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-white"
          aria-label={collapsed ? 'Expand object' : 'Collapse object'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span className="text-zinc-500">{'{' + keys.length + ' fields}'}</span>
        </button>
        {!collapsed && (
          <div className="pl-4 border-l border-zinc-800 my-1 space-y-1">
            {keys.map((k) => (
              <div key={k} className="flex flex-col sm:flex-row sm:items-start gap-1">
                <span className="font-mono text-cyan-400/90 text-xs">{k}:</span>
                <div className="flex-1">
                  <JsonValueTree value={value[k]} depth={depth + 1} glowClass={glowClass} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span className="font-mono text-zinc-300">{String(value)}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function StorageViewer({
  contractId = 'CA...SOROBAN_CONTRACT_7X9',
  initialStorage,
  beforeStorage = DEFAULT_MOCK_BEFORE_STORAGE,
  afterStorage = DEFAULT_MOCK_AFTER_STORAGE,
  snapshots = DEFAULT_MOCK_SNAPSHOTS,
  onRollback,
  onKeySelect,
  readOnly = false,
  className,
}: StorageViewerProps) {
  // Navigation & Snapshots
  const [timelineSnapshots, setTimelineSnapshots] = useState<LedgerSnapshot[]>(snapshots);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number>(
    snapshots.length > 0 ? snapshots.length - 1 : 0
  );

  // States for live / diff comparison
  const [activeBeforeState, setActiveBeforeState] = useState<ContractStorageState>(beforeStorage);
  const [activeAfterState, setActiveAfterState] = useState<ContractStorageState>(
    initialStorage || afterStorage
  );

  // View & Filter Controls
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<StorageCategory | 'all'>('all');
  const [selectedMutation, setSelectedMutation] = useState<MutationType | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rollbackSuccessMsg, setRollbackSuccessMsg] = useState<string | null>(null);

  // Synchronize with snapshot selection
  const currentSnapshot = useMemo(() => {
    if (timelineSnapshots.length === 0) return null;
    return timelineSnapshots[Math.min(selectedSnapshotIndex, timelineSnapshots.length - 1)];
  }, [timelineSnapshots, selectedSnapshotIndex]);

  // Compute Diffs
  const diffItems = useMemo(() => {
    return computeStorageDiff(activeBeforeState, activeAfterState);
  }, [activeBeforeState, activeAfterState]);

  // Summary Metrics
  const summary = useMemo(() => {
    let added = 0;
    let modified = 0;
    let deleted = 0;
    let unchanged = 0;
    let netBytes = 0;

    for (const item of diffItems) {
      if (item.mutation === 'added') added++;
      else if (item.mutation === 'modified') modified++;
      else if (item.mutation === 'deleted') deleted++;
      else unchanged++;
      netBytes += item.bytesDelta;
    }

    return {
      total: diffItems.length,
      added,
      modified,
      deleted,
      unchanged,
      netBytes,
    };
  }, [diffItems]);

  // Filtered Diffs
  const filteredDiffs = useMemo(() => {
    return diffItems.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // Mutation filter
      if (selectedMutation !== 'all' && item.mutation !== selectedMutation) {
        return false;
      }
      // Search filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const keyMatch = item.key.toLowerCase().includes(query);
        const typeMatch = item.keyType.toLowerCase().includes(query);
        const beforeValMatch = JSON.stringify(item.beforeValue ?? '')
          .toLowerCase()
          .includes(query);
        const afterValMatch = JSON.stringify(item.afterValue ?? '')
          .toLowerCase()
          .includes(query);

        if (!keyMatch && !typeMatch && !beforeValMatch && !afterValMatch) {
          return false;
        }
      }
      return true;
    });
  }, [diffItems, selectedCategory, selectedMutation, searchQuery]);

  // Copy to Clipboard
  const handleCopy = useCallback(async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(identifier);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  }, []);

  // Time-Travel Rollback Handler
  const handleTimeTravelRollback = useCallback(
    (index: number) => {
      if (index < 0 || index >= timelineSnapshots.length) return;
      const targetSnapshot = timelineSnapshots[index];
      setSelectedSnapshotIndex(index);

      // Rollback current active state to target snapshot state
      setActiveAfterState(targetSnapshot.storage);

      // Baseline before becomes previous snapshot if available, or initial
      if (index > 0) {
        setActiveBeforeState(timelineSnapshots[index - 1].storage);
      } else {
        setActiveBeforeState(timelineSnapshots[0].storage);
      }

      onRollback?.(targetSnapshot, targetSnapshot.sequence);

      setRollbackSuccessMsg(
        `State successfully rewound to Ledger #${targetSnapshot.sequence} (${targetSnapshot.label})`
      );
      setTimeout(() => setRollbackSuccessMsg(null), 4000);
    },
    [timelineSnapshots, onRollback]
  );

  // Manual Snapshot Creation (Simulation)
  const handleTakeManualSnapshot = useCallback(() => {
    const nextSeq =
      (timelineSnapshots[timelineSnapshots.length - 1]?.sequence || 1048577) + 1;
    const newSnapshot: LedgerSnapshot = {
      id: `snap-${nextSeq}`,
      sequence: nextSeq,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      label: `Manual Checkpoint #${nextSeq}`,
      methodInvoked: 'checkpoint_state()',
      txHash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      storage: JSON.parse(JSON.stringify(activeAfterState)),
    };

    const updated = [...timelineSnapshots, newSnapshot];
    setTimelineSnapshots(updated);
    setSelectedSnapshotIndex(updated.length - 1);
  }, [timelineSnapshots, activeAfterState]);

  // Export State JSON
  const handleExportState = useCallback(() => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(
        JSON.stringify(
          {
            contractId,
            exportedAt: new Date().toISOString(),
            currentSnapshot,
            diffSummary: summary,
            storage: activeAfterState,
            history: timelineSnapshots,
          },
          null,
          2
        )
      );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `contract-storage-${contractId.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, [contractId, currentSnapshot, summary, activeAfterState, timelineSnapshots]);

  return (
    <div
      data-testid="storage-diff-inspector"
      aria-label="State Diff Inspector with Time-Travel Ledger Rollback"
      className={cn(
        'flex flex-col w-full rounded-3xl border border-white/10 bg-zinc-950 p-4 sm:p-6 md:p-8 text-zinc-100 shadow-2xl overflow-hidden',
        className
      )}
    >
      {/* ── Top Header & Contract Metadata ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wider text-white uppercase">
                Soroban State Diff Inspector
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                FE-HARD-20
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Side-by-side contract instance & persistent storage diff engine with timeline rollback
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-500">Contract:</span>
                <span className="text-zinc-200 bg-zinc-900 px-2 py-0.5 rounded-md border border-white/5">
                  {contractId}
                </span>
              </span>
              {currentSnapshot && (
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Ledger #{currentSnapshot.sequence}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTakeManualSnapshot}
            disabled={readOnly}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 transition disabled:opacity-50"
            title="Create snapshot of current state"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Snapshot</span>
          </button>
          <button
            type="button"
            onClick={handleExportState}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            title="Export state and diffs as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* ── Time-Travel Ledger Rollback Timeline Bar ─────────────────────────── */}
      <div className="my-6 rounded-2xl bg-zinc-900/70 border border-white/10 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-300">
              Time-Travel Ledger Timeline
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              ({timelineSnapshots.length} checkpoints recorded)
            </span>
          </div>

          {/* Stepper controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={selectedSnapshotIndex <= 0}
              onClick={() => handleTimeTravelRollback(0)}
              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition"
              title="First Snapshot"
            >
              |&lt;
            </button>
            <button
              type="button"
              disabled={selectedSnapshotIndex <= 0}
              onClick={() => handleTimeTravelRollback(selectedSnapshotIndex - 1)}
              className="px-2 py-1 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-30 transition flex items-center gap-1"
              title="Previous Ledger Snapshot"
            >
              &lt; Rewind
            </button>
            <span className="px-3 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-xs font-mono font-bold text-indigo-300">
              Ledger #{currentSnapshot?.sequence}
            </span>
            <button
              type="button"
              disabled={selectedSnapshotIndex >= timelineSnapshots.length - 1}
              onClick={() => handleTimeTravelRollback(selectedSnapshotIndex + 1)}
              className="px-2 py-1 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-30 transition flex items-center gap-1"
              title="Next Ledger Snapshot"
            >
              Forward &gt;
            </button>
            <button
              type="button"
              disabled={selectedSnapshotIndex >= timelineSnapshots.length - 1}
              onClick={() => handleTimeTravelRollback(timelineSnapshots.length - 1)}
              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition"
              title="Latest Snapshot"
            >
              &gt;|
            </button>
          </div>
        </div>

        {/* Timeline Snapshot Nodes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2">
          {timelineSnapshots.map((snap, idx) => {
            const isSelected = idx === selectedSnapshotIndex;
            return (
              <div
                key={snap.id}
                onClick={() => handleTimeTravelRollback(idx)}
                className={cn(
                  'cursor-pointer rounded-xl p-3 border transition text-left relative overflow-hidden',
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50'
                    : 'bg-zinc-950/50 border-white/5 hover:border-white/20 hover:bg-zinc-800/40'
                )}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-mono font-bold text-indigo-400">
                    Seq #{snap.sequence}
                  </span>
                  <span className="text-[9px] text-zinc-500">{snap.timestamp.slice(11, 19)}</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 truncate">{snap.label}</div>
                {snap.methodInvoked && (
                  <div className="mt-1 font-mono text-[10px] text-zinc-400 truncate bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                    {snap.methodInvoked}
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-bl-full" />
                )}
              </div>
            );
          })}
        </div>

        {/* Rollback Success Toast Alert */}
        {rollbackSuccessMsg && (
          <div
            role="status"
            className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-400 animate-fadeIn"
          >
            <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            <span>{rollbackSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* ── Summary Stats Banner & View Modes ────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Metrics Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 font-bold text-zinc-300">
            Total Keys: <span className="text-white ml-1">{summary.total}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <Plus className="w-3 h-3" />
            <span>Added: {summary.added}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
            <span>~</span>
            <span>Modified: {summary.modified}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
            <Minus className="w-3 h-3" />
            <span>Deleted: {summary.deleted}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-zinc-400 font-mono text-[11px]">
            Δ Storage:{' '}
            <span
              className={cn(
                'font-bold ml-1',
                summary.netBytes > 0
                  ? 'text-emerald-400'
                  : summary.netBytes < 0
                  ? 'text-rose-400'
                  : 'text-zinc-300'
              )}
            >
              {summary.netBytes > 0 ? `+${summary.netBytes} B` : `${summary.netBytes} B`}
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-zinc-900 rounded-xl p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setViewMode('side-by-side')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition',
              viewMode === 'side-by-side'
                ? 'bg-zinc-800 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Side-by-side before and after comparison"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Side-by-Side</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('unified')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition',
              viewMode === 'unified'
                ? 'bg-zinc-800 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Unified linear diff list"
          >
            <List className="w-3.5 h-3.5" />
            <span>Unified Diff</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition',
              viewMode === 'tree'
                ? 'bg-zinc-800 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Raw storage JSON tree"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>JSON Tree</span>
          </button>
        </div>
      </div>

      {/* ── Search & Multi-Criteria Filtering Controls ───────────────────────── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-6">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter storage by key name, data type, or value..."
            aria-label="Filter storage by key"
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center bg-zinc-900 rounded-xl p-1 border border-white/10 text-xs">
            {(['all', 'instance', 'persistent', 'temporary'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-bold capitalize transition',
                  selectedCategory === cat
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Mutation Filter */}
          <div className="flex items-center bg-zinc-900 rounded-xl p-1 border border-white/10 text-xs">
            {(['all', 'added', 'modified', 'deleted', 'unchanged'] as const).map((mut) => (
              <button
                key={mut}
                type="button"
                onClick={() => setSelectedMutation(mut)}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-bold capitalize transition',
                  selectedMutation === mut
                    ? mut === 'added'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : mut === 'modified'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : mut === 'deleted'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {mut}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Visual Diff Inspection Area ──────────────────────────────────────── */}
      <div className="flex-1 min-h-[360px] rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden flex flex-col">
        {filteredDiffs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center my-auto">
            <AlertCircle className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-sm font-semibold text-zinc-400">No matching storage keys found</p>
            <p className="text-xs text-zinc-600 mt-1">
              Try adjusting your search query or filter criteria
            </p>
          </div>
        ) : viewMode === 'side-by-side' ? (
          /* ── Side-by-Side Diff View ── */
          <div className="flex flex-col divide-y divide-zinc-900">
            {/* Column Headers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 bg-zinc-900/80 px-4 py-3 border-b border-white/10 text-xs font-bold tracking-wider text-zinc-400 uppercase">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Before Invocation (Baseline State)</span>
              </div>
              <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>After Invocation (Mutated State)</span>
              </div>
            </div>

            {/* Rows */}
            {filteredDiffs.map((item) => {
              const isAdded = item.mutation === 'added';
              const isDeleted = item.mutation === 'deleted';
              const isModified = item.mutation === 'modified';
              const isUnchanged = item.mutation === 'unchanged';

              const rowGlowClass = isAdded
                ? 'bg-emerald-950/20 border-l-4 border-l-emerald-500 hover:bg-emerald-950/30'
                : isDeleted
                ? 'bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-950/30'
                : isModified
                ? 'bg-amber-950/20 border-l-4 border-l-amber-500 hover:bg-amber-950/30'
                : 'hover:bg-zinc-900/50 border-l-4 border-l-transparent';

              return (
                <div
                  key={item.key}
                  onClick={() => {
                    setSelectedKey(item.key);
                    onKeySelect?.(item.key, item);
                  }}
                  className={cn(
                    'grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 transition text-xs font-mono group cursor-pointer',
                    rowGlowClass,
                    selectedKey === item.key && 'ring-1 ring-indigo-500'
                  )}
                >
                  {/* Left Column: Before State */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-900 text-zinc-400 border border-white/5">
                          {item.category}
                        </span>
                        <span className="font-bold text-white truncate">{item.key}</span>
                        <span className="text-[10px] text-zinc-500">({item.keyType})</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(JSON.stringify(item.beforeValue, null, 2), `b-${item.key}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                        title="Copy Before Value"
                      >
                        {copiedKey === `b-${item.key}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div
                      className={cn(
                        'p-3 rounded-xl border bg-black/60 overflow-x-auto min-h-[50px] flex items-center',
                        isDeleted
                          ? 'border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.1)]'
                          : isModified
                          ? 'border-amber-500/30 text-amber-200 line-through decoration-rose-500/60'
                          : isAdded
                          ? 'border-dashed border-zinc-800 text-zinc-600'
                          : 'border-white/5 text-zinc-300'
                      )}
                    >
                      {isAdded ? (
                        <span className="text-zinc-600 italic font-mono text-[11px]">
                          &lt;Key does not exist in before state&gt;
                        </span>
                      ) : (
                        <JsonValueTree value={item.beforeValue} />
                      )}
                    </div>
                  </div>

                  {/* Right Column: After State */}
                  <div className="flex flex-col gap-2 lg:pl-4 lg:border-l lg:border-zinc-900">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isAdded && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                            + ADDED
                          </span>
                        )}
                        {isModified && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                            ~ MODIFIED
                          </span>
                        )}
                        {isDeleted && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.2)]">
                            - DELETED
                          </span>
                        )}
                        {isUnchanged && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-900 text-zinc-500 border border-white/5">
                            UNCHANGED
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(JSON.stringify(item.afterValue, null, 2), `a-${item.key}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                        title="Copy After Value"
                      >
                        {copiedKey === `a-${item.key}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div
                      className={cn(
                        'p-3 rounded-xl border bg-black/60 overflow-x-auto min-h-[50px] flex items-center',
                        isAdded
                          ? 'border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30'
                          : isModified
                          ? 'border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30'
                          : isDeleted
                          ? 'border-dashed border-zinc-800 text-zinc-600'
                          : 'border-white/5 text-zinc-300'
                      )}
                    >
                      {isDeleted ? (
                        <span className="text-zinc-600 italic font-mono text-[11px]">
                          &lt;Key deleted from storage state&gt;
                        </span>
                      ) : (
                        <JsonValueTree value={item.afterValue} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'unified' ? (
          /* ── Unified Diff View ── */
          <div className="flex flex-col divide-y divide-zinc-900">
            {filteredDiffs.map((item) => {
              const isAdded = item.mutation === 'added';
              const isDeleted = item.mutation === 'deleted';
              const isModified = item.mutation === 'modified';

              return (
                <div
                  key={item.key}
                  className={cn(
                    'p-4 transition text-xs font-mono group flex flex-col gap-2',
                    isAdded
                      ? 'bg-emerald-950/20 border-l-4 border-l-emerald-500'
                      : isDeleted
                      ? 'bg-rose-950/20 border-l-4 border-l-rose-500'
                      : isModified
                      ? 'bg-amber-950/20 border-l-4 border-l-amber-500'
                      : 'hover:bg-zinc-900/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-900 text-zinc-400 border border-white/5">
                        {item.category}
                      </span>
                      <span className="font-bold text-white">{item.key}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">
                        ({item.keyType})
                      </span>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                        isAdded
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : isModified
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : isDeleted
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-zinc-900 text-zinc-500'
                      )}
                    >
                      {item.mutation}
                    </span>
                  </div>

                  {isModified ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                      <div className="p-2.5 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300">
                        <div className="text-[10px] font-bold text-rose-400 mb-1">- BEFORE:</div>
                        <JsonValueTree value={item.beforeValue} />
                      </div>
                      <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300">
                        <div className="text-[10px] font-bold text-emerald-400 mb-1">+ AFTER:</div>
                        <JsonValueTree value={item.afterValue} />
                      </div>
                    </div>
                  ) : isDeleted ? (
                    <div className="p-2.5 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300">
                      <div className="text-[10px] font-bold text-rose-400 mb-1">- DELETED:</div>
                      <JsonValueTree value={item.beforeValue} />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'p-2.5 rounded-xl border bg-black/60',
                        isAdded
                          ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                          : 'border-white/5 text-zinc-300'
                      )}
                    >
                      {isAdded && (
                        <div className="text-[10px] font-bold text-emerald-400 mb-1">+ ADDED:</div>
                      )}
                      <JsonValueTree value={item.afterValue} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── JSON Tree View ── */
          <div className="p-6 overflow-x-auto font-mono text-xs text-zinc-200">
            <div className="mb-4 flex items-center justify-between pb-3 border-b border-zinc-900">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Full Current Contract Storage Hierarchy
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopy(JSON.stringify(activeAfterState, null, 2), 'raw-tree')
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white transition"
              >
                {copiedKey === 'raw-tree' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy JSON Tree</span>
              </button>
            </div>
            <JsonValueTree value={activeAfterState} />
          </div>
        )}
      </div>

      {/* ── Footer Information & Legend ──────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 border-t border-white/5 pt-4">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-zinc-300 font-semibold">Green Glow:</span> Key Added
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
            <span className="text-zinc-300 font-semibold">Red Glow:</span> Key Deleted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <span className="text-zinc-300 font-semibold">Amber Glow:</span> Key Modified
          </span>
        </div>
        <div className="font-mono text-[11px]">
          Soroban SDK Storage Spec • Instance & Persistent Tiers
        </div>
      </div>
    </div>
  );
}
