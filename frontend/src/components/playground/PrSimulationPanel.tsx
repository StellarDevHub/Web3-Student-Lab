'use client';

import {
  GitPullRequest,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileDiff,
  ArrowRight,
  Clock,
  Play,
  Layers,
} from 'lucide-react';
import { useState, useMemo } from 'react';

// ── Types (mirrors Soroban contract enums) ──────────────────────────────────

export type ChangeSeverity = 'Safe' | 'Breaking';

export type SimulationStatus =
  | 'Draft'
  | 'Analysed'
  | 'Approved'
  | 'Rejected'
  | 'Executed';

export interface StorageChange {
  keyName: string;
  oldType: string;
  newType: string;
  severity: ChangeSeverity;
  reason: string;
}

export interface SimulationRecord {
  id: number;
  author: string;
  title: string;
  currentWasm: string;
  proposedWasm: string;
  changes: StorageChange[];
  verdict: ChangeSeverity;
  status: SimulationStatus;
}

// ── Demo data — mirrors V1→V2 upgrade from the existing proxy pattern ──────

const DEMO_SIMULATIONS: SimulationRecord[] = [
  {
    id: 0,
    author: '0xStudent',
    title: 'feat: add Name field to StudentRecord (V1→V2)',
    currentWasm: '0xa1b2...v1',
    proposedWasm: '0xc3d4...v2',
    changes: [
      {
        keyName: 'ProxyDataKey.Admin',
        oldType: 'Address',
        newType: 'Address',
        severity: 'Safe',
        reason: 'Type unchanged — admin state preserved.',
      },
      {
        keyName: 'ProxyDataKey.ImplementationWasm',
        oldType: 'BytesN<32>',
        newType: 'BytesN<32>',
        severity: 'Safe',
        reason: 'Type unchanged — upgrade pointer preserved.',
      },
      {
        keyName: 'ImplDataKey.Score(Address)',
        oldType: 'u32',
        newType: 'u32',
        severity: 'Safe',
        reason: 'Type unchanged — existing scores remain readable.',
      },
      {
        keyName: 'ImplDataKey.Name(Address)',
        oldType: '',
        newType: 'String',
        severity: 'Safe',
        reason: 'Additive new key — safe migration, no existing data affected.',
      },
    ],
    verdict: 'Safe',
    status: 'Analysed',
  },
  {
    id: 1,
    author: '0xStudent',
    title: 'BREAKING: change Score from u32 to u64',
    currentWasm: '0xa1b2...v1',
    proposedWasm: '0xe5f6...v3',
    changes: [
      {
        keyName: 'ImplDataKey.Score(Address)',
        oldType: 'u32',
        newType: 'u64',
        severity: 'Breaking',
        reason:
          'Type changed from u32 to u64 — Soroban will panic when deserialising old u32 XDR bytes into u64. Use a new key (e.g. ScoreV2) or write a migration function.',
      },
      {
        keyName: 'ImplDataKey.Name(Address)',
        oldType: 'String',
        newType: 'String',
        severity: 'Safe',
        reason: 'Type unchanged.',
      },
    ],
    verdict: 'Breaking',
    status: 'Rejected',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<SimulationStatus, string> = {
  Draft: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
  Analysed: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Approved: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
  Executed: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

const STATUS_ICONS: Record<SimulationStatus, React.ReactNode> = {
  Draft: <Clock className="h-3.5 w-3.5" />,
  Analysed: <FileDiff className="h-3.5 w-3.5" />,
  Approved: <ShieldCheck className="h-3.5 w-3.5" />,
  Rejected: <ShieldAlert className="h-3.5 w-3.5" />,
  Executed: <Play className="h-3.5 w-3.5" />,
};

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ChangeRow({ change }: { change: StorageChange }) {
  const isBreaking = change.severity === 'Breaking';
  const isAdditive = change.oldType === '';

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border p-4 transition-all ${
        isBreaking
          ? 'border-red-500/20 bg-red-500/5 hover:border-red-500/40'
          : 'border-white/5 bg-black/30 hover:border-white/10'
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {isBreaking ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : isAdditive ? (
          <Layers className="h-4 w-4 text-emerald-400" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <code className="text-xs font-bold text-white">{change.keyName}</code>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              isBreaking
                ? 'border-red-500/30 text-red-400'
                : 'border-emerald-500/30 text-emerald-400'
            }`}
          >
            {change.severity}
          </span>
        </div>
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-mono">
          {change.oldType ? (
            <span className="text-zinc-500">{change.oldType}</span>
          ) : (
            <span className="italic text-zinc-600">(new key)</span>
          )}
          <ArrowRight className="h-3 w-3 text-zinc-600" />
          {change.newType ? (
            <span className="text-zinc-300">{change.newType}</span>
          ) : (
            <span className="italic text-red-400">(removed)</span>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          {change.reason}
        </p>
      </div>
    </div>
  );
}

function SimulationCard({
  sim,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
}: {
  sim: SimulationRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const breakingCount = sim.changes.filter(
    (c) => c.severity === 'Breaking',
  ).length;
  const safeCount = sim.changes.filter((c) => c.severity === 'Safe').length;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 transition-all hover:border-white/20">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={isExpanded}
        aria-label={`Toggle simulation ${sim.title}`}
      >
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
            sim.verdict === 'Safe'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          {sim.verdict === 'Safe' ? (
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="truncate text-xs font-bold text-white">
              {sim.title}
            </h4>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATUS_COLORS[sim.status]}`}
            >
              {STATUS_ICONS[sim.status]}
              {sim.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span>PR #{sim.id}</span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono">
              {truncateHash(sim.currentWasm)} → {truncateHash(sim.proposedWasm)}
            </span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-[10px]">
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              sim.verdict === 'Safe'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {sim.verdict}
          </span>
          <ArrowRight
            className={`h-4 w-4 text-zinc-600 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/5 p-5">
          {/* Summary bar */}
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-white/5 bg-black/50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
              <FileDiff className="h-3.5 w-3.5" />
              {sim.changes.length} change{sim.changes.length !== 1 ? 's' : ''}
            </div>
            {safeCount > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {safeCount} safe
              </div>
            )}
            {breakingCount > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {breakingCount} breaking
              </div>
            )}
            <div className="flex-1" />
            <span className="text-[9px] font-mono text-zinc-600">
              {truncateHash(sim.currentWasm)} → {truncateHash(sim.proposedWasm)}
            </span>
          </div>

          {/* Change list */}
          <div className="space-y-3">
            {sim.changes.map((change, i) => (
              <ChangeRow key={`${sim.id}-${i}`} change={change} />
            ))}
          </div>

          {/* Action buttons for analysed simulations */}
          {sim.status === 'Analysed' && (
            <div className="mt-5 flex items-center gap-3 border-t border-white/5 pt-5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(sim.id);
                }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-black tracking-widest text-emerald-400 uppercase transition-all hover:bg-emerald-500/20 active:scale-[0.98]"
                aria-label="Approve simulation"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(sim.id);
                }}
                className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[10px] font-black tracking-widest text-red-400 uppercase transition-all hover:bg-red-500/20 active:scale-[0.98]"
                aria-label="Reject simulation"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface PrSimulationPanelProps {
  className?: string;
}

export function PrSimulationPanel({ className = '' }: PrSimulationPanelProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'simulations' | 'guide'>(
    'simulations',
  );
  const [simulations, setSimulations] = useState<SimulationRecord[]>(DEMO_SIMULATIONS);

  const safeCount = useMemo(
    () => simulations.filter((s) => s.verdict === 'Safe').length,
    [simulations],
  );
  const breakingCount = useMemo(
    () => simulations.filter((s) => s.verdict === 'Breaking').length,
    [simulations],
  );

  const handleApprove = (id: number) => {
    setSimulations((prev) =>
      prev.map((s) =>
        s.id === id && s.status === 'Analysed'
          ? { ...s, status: 'Approved' as SimulationStatus }
          : s,
      ),
    );
  };

  const handleReject = (id: number) => {
    setSimulations((prev) =>
      prev.map((s) =>
        s.id === id && s.status === 'Analysed'
          ? { ...s, status: 'Rejected' as SimulationStatus }
          : s,
      ),
    );
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-zinc-950 p-1">
        <button
          onClick={() => setActiveTab('simulations')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[10px] font-bold tracking-widest uppercase transition-all ${
            activeTab === 'simulations'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          Simulations
          <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px]">
            {DEMO_SIMULATIONS.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[10px] font-bold tracking-widest uppercase transition-all ${
            activeTab === 'guide'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <FileDiff className="h-3.5 w-3.5" />
          Guide
        </button>
      </div>

      {activeTab === 'simulations' ? (
        <>
          {/* Stats bar */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-3 text-center">
              <div className="text-lg font-black text-white">
                {simulations.length}
              </div>
              <div className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">
                Total PRs
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <div className="text-lg font-black text-emerald-400">
                {safeCount}
              </div>
              <div className="text-[9px] font-bold tracking-widest text-emerald-500/70 uppercase">
                Safe
              </div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
              <div className="text-lg font-black text-red-400">
                {breakingCount}
              </div>
              <div className="text-[9px] font-bold tracking-widest text-red-500/70 uppercase">
                Breaking
              </div>
            </div>
          </div>

          {/* Simulation list */}
          <div className="space-y-3">
            {simulations.map((sim) => (
              <SimulationCard
                key={sim.id}
                sim={sim}
                isExpanded={expandedId === sim.id}
                onToggle={() =>
                  setExpandedId(expandedId === sim.id ? null : sim.id)
                }
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        </>
      ) : (
        /* Guide tab */
        <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-6">
          <h4 className="text-xs font-black tracking-widest text-white uppercase">
            PR Simulation Guide
          </h4>
          <div className="space-y-4 text-[11px] leading-relaxed text-zinc-400">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <h5 className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                SAFE Changes
              </h5>
              <ul className="ml-6 list-disc space-y-1.5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Identical types</strong> —
                  storage key and value type both unchanged.
                </li>
                <li>
                  <strong className="text-zinc-300">Additive keys</strong> —
                  new storage key variants added to an existing enum (safe
                  migration pattern used by V1→V2).
                </li>
                <li>
                  <strong className="text-zinc-300">Renamed but compatible</strong>{' '}
                  — key renamed but serialised type is identical.
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <h5 className="mb-2 flex items-center gap-2 text-xs font-bold text-red-400">
                <AlertTriangle className="h-4 w-4" />
                BREAKING Changes
              </h5>
              <ul className="ml-6 list-disc space-y-1.5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Type change</strong> —
                  changing a value type (e.g. u32 → u64) causes deserialisation
                  panics when reading old XDR data.
                </li>
                <li>
                  <strong className="text-zinc-300">Removed key</strong> —
                  deleting a storage key variant orphans existing on-chain data.
                </li>
                <li>
                  <strong className="text-zinc-300">
                    Collision-introducing
                  </strong>{' '}
                  — two distinct enums that happen to hash to the same XDR key.
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <h5 className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-400">
                <Layers className="h-4 w-4" />
                Safe Migration Pattern
              </h5>
              <p className="mb-3 text-zinc-400">
                When you need to change a value type, introduce a{' '}
                <em>new</em> key variant with a different name:
              </p>
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black p-3 font-mono text-[10px] text-zinc-300">
                {`// BREAKING (avoid this):\nenum Key { Score(Address) }  // u32 → u64\n\n// SAFE (use this):\nenum Key {\n  Score(Address),     // preserves old u32 data\n  ScoreV2(Address),   // new u64 key\n}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrSimulationPanel;
