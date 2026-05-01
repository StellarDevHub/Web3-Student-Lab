'use client';

import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';

const TOTAL_BPS = 10_000;
const MAX_RECIPIENTS = 50;

export interface Recipient {
  address: string;
  shareBps: number;
}

export interface DistributionRecord {
  index: number;
  totalAmount: bigint;
  timestamp: number;
  payouts: { address: string; amount: bigint }[];
}

export interface PendingUpdate {
  recipients: Recipient[];
  queuedAt: number;
  proposer: string;
  approvalMask: number;
}

export interface SplitterState {
  owner: string;
  asset: string;
  recipients: Recipient[];
  updateDelayLedgers: number;
  approvers: string[];
  requiredApprovals: number;
  currentLedger: number;
  pendingUpdate: PendingUpdate | null;
  history: DistributionRecord[];
}

/**
 * Adapter that talks to the on-chain RoyaltySplitter contract. Wire each
 * method to a Soroban client (e.g. `@stellar/stellar-sdk`) when integrating
 * with the deployed contract; the dashboard only assumes this shape.
 */
export interface SplitterAdapter {
  load: () => Promise<SplitterState>;
  distribute: (amount: bigint) => Promise<void>;
  proposeUpdate: (recipients: Recipient[]) => Promise<void>;
  approveUpdate: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  cancelUpdate: () => Promise<void>;
}

interface Props {
  /**
   * Adapter for live chain calls. If omitted, the dashboard runs against an
   * in-memory simulation — handy for design previews and Storybook.
   */
  adapter?: SplitterAdapter;
  initialState?: Partial<SplitterState>;
  /** Address used for "owner mode" gating in the simulation. */
  viewer?: string;
}

const sampleState: SplitterState = {
  owner: 'GBOWNER...DEMO',
  asset: 'XLM (native SAC)',
  recipients: [
    { address: 'GBCREATOR...AAAA', shareBps: 5_000 },
    { address: 'GBPLATFORM...BBBB', shareBps: 3_000 },
    { address: 'GBCONTRIB...CCCC', shareBps: 2_000 },
  ],
  updateDelayLedgers: 100,
  approvers: ['GBOWNER...DEMO', 'GBAPPROVER...XXXX'],
  requiredApprovals: 1,
  currentLedger: 1_000_000,
  pendingUpdate: null,
  history: [],
};

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function computePayouts(recipients: Recipient[], total: bigint): bigint[] {
  if (recipients.length === 0 || total <= 0n) return [];
  const out: bigint[] = [];
  let accumulated = 0n;
  const last = recipients.length - 1;
  for (let i = 0; i < recipients.length; i++) {
    if (i === last) {
      out.push(total - accumulated);
    } else {
      const share = (total * BigInt(recipients[i].shareBps)) / BigInt(TOTAL_BPS);
      accumulated += share;
      out.push(share);
    }
  }
  return out;
}

function validateRecipients(recipients: Recipient[]): string | null {
  if (recipients.length === 0) return 'At least one recipient is required.';
  if (recipients.length > MAX_RECIPIENTS)
    return `At most ${MAX_RECIPIENTS} recipients are allowed.`;
  const seen = new Set<string>();
  let total = 0;
  for (const r of recipients) {
    const addr = r.address.trim();
    if (!addr) return 'Every recipient must have an address.';
    if (seen.has(addr)) return `Duplicate recipient: ${shortAddress(addr)}.`;
    seen.add(addr);
    if (!Number.isFinite(r.shareBps) || r.shareBps <= 0)
      return 'Each share must be a positive number of basis points.';
    total += r.shareBps;
  }
  if (total !== TOTAL_BPS)
    return `Shares must sum to 100% (currently ${formatBps(total)}).`;
  return null;
}

export default function SplitterDashboard({ adapter, initialState, viewer }: Props) {
  const [state, setState] = useState<SplitterState>(() => ({
    ...sampleState,
    ...(initialState ?? {}),
  }));
  const [activeTab, setActiveTab] = useState<
    'overview' | 'distribute' | 'manage' | 'history'
  >('overview');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = !viewer || viewer === state.owner;

  const totalDistributed = useMemo(
    () => state.history.reduce((sum, r) => sum + r.totalAmount, 0n),
    [state.history],
  );

  const perRecipientTotals = useMemo(() => {
    const totals = new Map<string, bigint>();
    for (const r of state.history) {
      for (const p of r.payouts) {
        totals.set(p.address, (totals.get(p.address) ?? 0n) + p.amount);
      }
    }
    return totals;
  }, [state.history]);

  const wrap = async (fn: () => Promise<void> | void) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshFromAdapter = async () => {
    if (!adapter) return;
    const next = await adapter.load();
    setState(next);
  };

  const distributeLocal = (amount: bigint) => {
    const payouts = computePayouts(state.recipients, amount);
    const record: DistributionRecord = {
      index: state.history.length,
      totalAmount: amount,
      timestamp: Date.now(),
      payouts: state.recipients.map((r, i) => ({
        address: r.address,
        amount: payouts[i],
      })),
    };
    setState((s) => ({ ...s, history: [...s.history, record] }));
  };

  const handleDistribute = (amount: bigint) =>
    wrap(async () => {
      if (amount <= 0n) throw new Error('Amount must be positive.');
      if (adapter) {
        await adapter.distribute(amount);
        await refreshFromAdapter();
      } else {
        distributeLocal(amount);
      }
    });

  const handleProposeUpdate = (recipients: Recipient[]) =>
    wrap(async () => {
      const v = validateRecipients(recipients);
      if (v) throw new Error(v);
      if (adapter) {
        await adapter.proposeUpdate(recipients);
        await refreshFromAdapter();
      } else {
        setState((s) => ({
          ...s,
          pendingUpdate: {
            recipients,
            queuedAt: s.currentLedger,
            proposer: viewer ?? s.owner,
            approvalMask: 0,
          },
        }));
      }
    });

  const handleApproveUpdate = () =>
    wrap(async () => {
      if (adapter) {
        await adapter.approveUpdate();
        await refreshFromAdapter();
        return;
      }
      setState((s) => {
        if (!s.pendingUpdate) return s;
        const idx = s.approvers.findIndex((a) => a === (viewer ?? s.owner));
        if (idx < 0) throw new Error('Caller is not an approver.');
        const bit = 1 << idx;
        if (s.pendingUpdate.approvalMask & bit)
          throw new Error('Already approved.');
        return {
          ...s,
          pendingUpdate: {
            ...s.pendingUpdate,
            approvalMask: s.pendingUpdate.approvalMask | bit,
          },
        };
      });
    });

  const handleApplyUpdate = () =>
    wrap(async () => {
      if (adapter) {
        await adapter.applyUpdate();
        await refreshFromAdapter();
        return;
      }
      setState((s) => {
        const p = s.pendingUpdate;
        if (!p) throw new Error('No pending update.');
        if (s.currentLedger < p.queuedAt + s.updateDelayLedgers)
          throw new Error('Update delay has not elapsed.');
        const approvalCount = bitsSet(p.approvalMask);
        if (approvalCount < s.requiredApprovals)
          throw new Error(
            `Need ${s.requiredApprovals} approvals (have ${approvalCount}).`,
          );
        return { ...s, recipients: p.recipients, pendingUpdate: null };
      });
    });

  const handleCancelUpdate = () =>
    wrap(async () => {
      if (adapter) {
        await adapter.cancelUpdate();
        await refreshFromAdapter();
        return;
      }
      setState((s) => ({ ...s, pendingUpdate: null }));
    });

  const advanceLedger = (delta: number) =>
    setState((s) => ({ ...s, currentLedger: s.currentLedger + delta }));

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Royalty Splitter</h1>
          <p className="text-muted-foreground text-sm">
            Configure recipients, distribute payments, and audit history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Owner: {shortAddress(state.owner)}</Badge>
          <Badge variant="outline">Asset: {state.asset}</Badge>
          {!isOwner && <Badge variant="secondary">read-only</Badge>}
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <nav className="flex gap-2 border-b">
        {(['overview', 'distribute', 'manage', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <OverviewTab
          state={state}
          totalDistributed={totalDistributed}
          perRecipientTotals={perRecipientTotals}
        />
      )}
      {activeTab === 'distribute' && (
        <DistributeTab
          state={state}
          onDistribute={handleDistribute}
          busy={busy}
        />
      )}
      {activeTab === 'manage' && (
        <ManageTab
          state={state}
          isOwner={isOwner}
          viewer={viewer ?? state.owner}
          busy={busy}
          onPropose={handleProposeUpdate}
          onApprove={handleApproveUpdate}
          onApply={handleApplyUpdate}
          onCancel={handleCancelUpdate}
          onAdvanceLedger={adapter ? undefined : advanceLedger}
        />
      )}
      {activeTab === 'history' && <HistoryTab state={state} />}
    </div>
  );
}

function bitsSet(mask: number): number {
  let n = mask;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

interface OverviewTabProps {
  state: SplitterState;
  totalDistributed: bigint;
  perRecipientTotals: Map<string, bigint>;
}

function OverviewTab({ state, totalDistributed, perRecipientTotals }: OverviewTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Active allocation. Shares sum to 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.recipients.map((r) => {
            const earned = perRecipientTotals.get(r.address) ?? 0n;
            return (
              <div key={r.address} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">{shortAddress(r.address)}</span>
                  <span className="font-medium">{formatBps(r.shareBps)}</span>
                </div>
                <Progress value={r.shareBps} max={TOTAL_BPS} />
                <div className="text-muted-foreground text-xs">
                  Earned: {earned.toString()}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>Lifetime totals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Stat label="Distributions" value={state.history.length.toString()} />
          <Stat label="Total distributed" value={totalDistributed.toString()} />
          <Stat label="Recipients" value={state.recipients.length.toString()} />
          <Stat
            label="Update delay"
            value={`${state.updateDelayLedgers} ledgers`}
          />
          <Stat
            label="Approvers"
            value={`${state.approvers.length} (need ${state.requiredApprovals})`}
          />
          {state.pendingUpdate && (
            <Badge variant="secondary">Pending update queued</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

interface DistributeTabProps {
  state: SplitterState;
  onDistribute: (amount: bigint) => Promise<void>;
  busy: boolean;
}

function DistributeTab({ state, onDistribute, busy }: DistributeTabProps) {
  const [amountStr, setAmountStr] = useState('1000');

  const amount = (() => {
    try {
      return BigInt(amountStr);
    } catch {
      return null;
    }
  })();

  const previewPayouts =
    amount && amount > 0n ? computePayouts(state.recipients, amount) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribute payment</CardTitle>
        <CardDescription>
          Atomically forwards each recipient&apos;s pro-rata slice. Rounding
          remainders go to the last recipient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (token base units)</Label>
          <Input
            id="amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="1000"
          />
        </div>

        {previewPayouts && (
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground mb-2">Preview</div>
            <ul className="space-y-1">
              {state.recipients.map((r, i) => (
                <li key={r.address} className="flex justify-between font-mono">
                  <span>{shortAddress(r.address)}</span>
                  <span>{previewPayouts[i].toString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          disabled={busy || !amount || amount <= 0n}
          onClick={() => amount && onDistribute(amount)}
        >
          {busy ? 'Submitting…' : 'Distribute'}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ManageTabProps {
  state: SplitterState;
  isOwner: boolean;
  viewer: string;
  busy: boolean;
  onPropose: (recipients: Recipient[]) => Promise<void>;
  onApprove: () => Promise<void>;
  onApply: () => Promise<void>;
  onCancel: () => Promise<void>;
  /** Simulation-only helper to advance the ledger past the delay. */
  onAdvanceLedger?: (delta: number) => void;
}

function ManageTab({
  state,
  isOwner,
  viewer,
  busy,
  onPropose,
  onApprove,
  onApply,
  onCancel,
  onAdvanceLedger,
}: ManageTabProps) {
  const [draft, setDraft] = useState<Recipient[]>(state.recipients);

  const draftValidation = validateRecipients(draft);
  const draftTotal = draft.reduce((s, r) => s + (r.shareBps || 0), 0);

  const updateDraftAt = (i: number, patch: Partial<Recipient>) => {
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRecipient = () =>
    setDraft((d) => [...d, { address: '', shareBps: 0 }]);

  const removeRecipient = (i: number) =>
    setDraft((d) => d.filter((_, idx) => idx !== i));

  const distributeRemainder = () => {
    if (draft.length === 0) return;
    const others = draft.slice(0, -1).reduce((s, r) => s + (r.shareBps || 0), 0);
    const last = TOTAL_BPS - others;
    if (last < 0) return;
    setDraft((d) => d.map((r, i) => (i === d.length - 1 ? { ...r, shareBps: last } : r)));
  };

  const pending = state.pendingUpdate;
  const readyAt = pending ? pending.queuedAt + state.updateDelayLedgers : null;
  const delayRemaining =
    readyAt !== null ? Math.max(0, readyAt - state.currentLedger) : 0;
  const approverIdx = state.approvers.findIndex((a) => a === viewer);
  const callerHasApproved =
    pending && approverIdx >= 0
      ? Boolean(pending.approvalMask & (1 << approverIdx))
      : false;

  return (
    <div className="space-y-4">
      {pending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Pending update</CardTitle>
            <CardDescription>
              Proposed by {shortAddress(pending.proposer)} at ledger{' '}
              {pending.queuedAt}. Ready at ledger {readyAt}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <Stat label="Delay remaining" value={`${delayRemaining} ledgers`} />
              <Stat
                label="Approvals"
                value={`${bitsSet(pending.approvalMask)} / ${state.requiredApprovals}`}
              />
              <Stat
                label="New recipients"
                value={pending.recipients.length.toString()}
              />
            </div>
            <ul className="space-y-1 text-sm">
              {pending.recipients.map((r) => (
                <li key={r.address} className="flex justify-between font-mono">
                  <span>{shortAddress(r.address)}</span>
                  <span>{formatBps(r.shareBps)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {approverIdx >= 0 && !callerHasApproved && (
                <Button disabled={busy} onClick={onApprove}>
                  Approve
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  delayRemaining > 0 ||
                  bitsSet(pending.approvalMask) < state.requiredApprovals
                }
                onClick={onApply}
              >
                Apply update
              </Button>
              {isOwner && (
                <Button variant="destructive" disabled={busy} onClick={onCancel}>
                  Cancel
                </Button>
              )}
              {onAdvanceLedger && delayRemaining > 0 && (
                <Button
                  variant="outline"
                  onClick={() => onAdvanceLedger(delayRemaining)}
                >
                  Skip delay (sim)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Edit recipients</CardTitle>
          <CardDescription>
            Build the new allocation, then queue it. Changes apply only after
            the time delay and required approvals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_140px_auto] items-end gap-2"
            >
              <div className="space-y-1">
                <Label htmlFor={`addr-${i}`}>Address</Label>
                <Input
                  id={`addr-${i}`}
                  value={r.address}
                  onChange={(e) => updateDraftAt(i, { address: e.target.value })}
                  placeholder="G..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`bps-${i}`}>Share (bps)</Label>
                <Input
                  id={`bps-${i}`}
                  type="number"
                  min={0}
                  max={TOTAL_BPS}
                  value={r.shareBps}
                  onChange={(e) =>
                    updateDraftAt(i, { shareBps: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <Button
                variant="outline"
                onClick={() => removeRecipient(i)}
                disabled={draft.length <= 1}
              >
                Remove
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={addRecipient}
              disabled={draft.length >= MAX_RECIPIENTS}
            >
              Add recipient
            </Button>
            <Button variant="ghost" onClick={distributeRemainder}>
              Auto-fill last to 100%
            </Button>
            <span
              className={`ml-auto text-sm ${
                draftTotal === TOTAL_BPS ? 'text-foreground' : 'text-destructive'
              }`}
            >
              Total: {formatBps(draftTotal)}
            </span>
          </div>

          {draftValidation && (
            <p className="text-destructive text-sm">{draftValidation}</p>
          )}

          <Button
            disabled={
              busy || Boolean(state.pendingUpdate) || Boolean(draftValidation)
            }
            onClick={() => onPropose(draft)}
          >
            Propose update
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab({ state }: { state: SplitterState }) {
  if (state.history.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          No distributions yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribution history</CardTitle>
        <CardDescription>Most recent first.</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-2">#</th>
              <th>When</th>
              <th>Total</th>
              <th>Recipients</th>
              <th>Payouts</th>
            </tr>
          </thead>
          <tbody>
            {[...state.history].reverse().map((r) => (
              <tr key={r.index} className="border-t">
                <td className="py-2 font-mono">{r.index}</td>
                <td>{new Date(r.timestamp).toLocaleString()}</td>
                <td className="font-mono">{r.totalAmount.toString()}</td>
                <td>{r.payouts.length}</td>
                <td>
                  <ul className="space-y-0.5">
                    {r.payouts.map((p) => (
                      <li key={p.address} className="font-mono text-xs">
                        {shortAddress(p.address)} → {p.amount.toString()}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
