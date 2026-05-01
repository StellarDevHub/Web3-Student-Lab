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
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';

export type Tier = 'Bronze' | 'Silver' | 'Gold';

const TIER_RANK: Record<Tier, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
};

export interface TierMeta {
  tier: Tier;
  benefits: string[];
  ratePerEpoch: bigint;
  count: number;
}

export interface MembershipToken {
  tokenId: number;
  tier: Tier;
  soulbound: boolean;
  mintedAt: number;
}

export interface ResourceConfig {
  name: string;
  minTier: Tier;
  paused: boolean;
}

export interface TempGrant {
  resource: string;
  grantedUntil: number;
}

export type AccessReason = 'denied' | 'tier' | 'temp-grant' | 'paused';

export interface MembershipState {
  viewer: string;
  tiers: TierMeta[];
  tokens: MembershipToken[];
  resources: ResourceConfig[];
  tempGrants: TempGrant[];
  epochSeconds: number;
  /** Current chain time (seconds). Used to evaluate temp-grant expiry. */
  nowSeconds: number;
  /** Current epoch number (lifetime epochs since contract genesis). */
  currentEpoch: number;
  /** Last epoch the viewer claimed for, or null if not yet registered. */
  lastClaimEpoch: number | null;
  claimedBalance: bigint;
}

/**
 * Adapter for live chain calls. The dashboard talks to this adapter; default
 * behaviour is an in-memory simulation suitable for previews.
 */
export interface MembershipAdapter {
  load: () => Promise<MembershipState>;
  claimBenefits: () => Promise<void>;
  /** Optional: only meaningful when the viewer is the contract admin. */
  mint?: (to: string, tier: Tier, soulbound: boolean) => Promise<void>;
}

interface Props {
  adapter?: MembershipAdapter;
  initialState?: Partial<MembershipState>;
}

const sampleState: MembershipState = {
  viewer: 'GBVIEWER...DEMO',
  tiers: [
    {
      tier: 'Bronze',
      benefits: ['Public courses', 'Community forum'],
      ratePerEpoch: 1n,
      count: 124,
    },
    {
      tier: 'Silver',
      benefits: [
        'All Bronze benefits',
        'Premium courses',
        'Monthly office hours',
      ],
      ratePerEpoch: 5n,
      count: 38,
    },
    {
      tier: 'Gold',
      benefits: [
        'All Silver benefits',
        'Mentor matching',
        'Capstone reviews',
        'Job-board access',
      ],
      ratePerEpoch: 15n,
      count: 7,
    },
  ],
  tokens: [
    { tokenId: 42, tier: 'Silver', soulbound: false, mintedAt: 1_700_000_000 },
  ],
  resources: [
    { name: 'public-course', minTier: 'Bronze', paused: false },
    { name: 'premium-course', minTier: 'Silver', paused: false },
    { name: 'mentor-matching', minTier: 'Gold', paused: false },
    { name: 'beta-playground', minTier: 'Silver', paused: true },
  ],
  tempGrants: [],
  epochSeconds: 86_400,
  nowSeconds: 1_705_000_000,
  currentEpoch: 60,
  lastClaimEpoch: 55,
  claimedBalance: 12n,
};

function highestTier(tokens: MembershipToken[]): Tier | null {
  let best: Tier | null = null;
  let bestRank = 0;
  for (const t of tokens) {
    if (TIER_RANK[t.tier] > bestRank) {
      best = t.tier;
      bestRank = TIER_RANK[t.tier];
    }
  }
  return best;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

interface Decision {
  allowed: boolean;
  reason: AccessReason;
}

function evaluateAccess(
  resource: ResourceConfig,
  viewerTier: Tier | null,
  grants: TempGrant[],
  now: number,
): Decision {
  if (resource.paused) return { allowed: false, reason: 'paused' };
  const grant = grants.find(
    (g) => g.resource === resource.name && g.grantedUntil > now,
  );
  if (grant) return { allowed: true, reason: 'temp-grant' };
  if (viewerTier && TIER_RANK[viewerTier] >= TIER_RANK[resource.minTier])
    return { allowed: true, reason: 'tier' };
  return { allowed: false, reason: 'denied' };
}

export default function MembershipDashboard({ adapter, initialState }: Props) {
  const [state, setState] = useState<MembershipState>(() => ({
    ...sampleState,
    ...(initialState ?? {}),
  }));
  const [activeTab, setActiveTab] = useState<
    'overview' | 'tiers' | 'access' | 'benefits'
  >('overview');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const viewerTier = useMemo(() => highestTier(state.tokens), [state.tokens]);

  const tierByName = useMemo(() => {
    const map = new Map<Tier, TierMeta>();
    for (const t of state.tiers) map.set(t.tier, t);
    return map;
  }, [state.tiers]);

  const ratePerEpoch = viewerTier
    ? tierByName.get(viewerTier)?.ratePerEpoch ?? 0n
    : 0n;

  const elapsedEpochs =
    state.lastClaimEpoch === null
      ? 0
      : Math.max(0, state.currentEpoch - state.lastClaimEpoch);

  const pendingBenefits = BigInt(elapsedEpochs) * ratePerEpoch;

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

  const handleClaim = () =>
    wrap(async () => {
      if (!viewerTier)
        throw new Error('Mint a membership before claiming benefits.');
      if (adapter) {
        await adapter.claimBenefits();
        const next = await adapter.load();
        setState(next);
        return;
      }
      setState((s) => ({
        ...s,
        claimedBalance: s.claimedBalance + pendingBenefits,
        lastClaimEpoch: s.currentEpoch,
      }));
    });

  const advanceEpochs = (n: number) =>
    setState((s) => ({
      ...s,
      currentEpoch: s.currentEpoch + n,
      nowSeconds: s.nowSeconds + n * s.epochSeconds,
    }));

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Membership</h1>
          <p className="text-muted-foreground text-sm">
            Tier-gated access, benefits accrual, and resource permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Viewer: {shortAddress(state.viewer)}</Badge>
          {viewerTier ? (
            <TierBadge tier={viewerTier} />
          ) : (
            <Badge variant="secondary">No membership</Badge>
          )}
        </div>
      </header>

      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      <nav className="flex gap-2 border-b">
        {(['overview', 'tiers', 'access', 'benefits'] as const).map((tab) => (
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
          viewerTier={viewerTier}
          pendingBenefits={pendingBenefits}
          ratePerEpoch={ratePerEpoch}
          elapsedEpochs={elapsedEpochs}
          tierByName={tierByName}
        />
      )}
      {activeTab === 'tiers' && (
        <TiersTab tiers={state.tiers} viewerTier={viewerTier} />
      )}
      {activeTab === 'access' && (
        <AccessTab
          state={state}
          viewerTier={viewerTier}
        />
      )}
      {activeTab === 'benefits' && (
        <BenefitsTab
          state={state}
          viewerTier={viewerTier}
          pendingBenefits={pendingBenefits}
          ratePerEpoch={ratePerEpoch}
          elapsedEpochs={elapsedEpochs}
          busy={busy}
          onClaim={handleClaim}
          onAdvanceEpochs={adapter ? undefined : advanceEpochs}
        />
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const styles: Record<Tier, string> = {
    Bronze: 'bg-amber-700/20 text-amber-700 border-amber-700/40',
    Silver: 'bg-slate-400/20 text-slate-500 border-slate-400/40',
    Gold: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/40',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[tier]}`}
    >
      {tier}
    </span>
  );
}

interface OverviewTabProps {
  state: MembershipState;
  viewerTier: Tier | null;
  pendingBenefits: bigint;
  ratePerEpoch: bigint;
  elapsedEpochs: number;
  tierByName: Map<Tier, TierMeta>;
}

function OverviewTab({
  state,
  viewerTier,
  pendingBenefits,
  ratePerEpoch,
  elapsedEpochs,
  tierByName,
}: OverviewTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Your memberships</CardTitle>
          <CardDescription>
            Tokens currently held. Tier of record is the highest tier among them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.tokens.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              You don&apos;t hold any memberships yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {state.tokens.map((t) => (
                <li
                  key={t.tokenId}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono">#{t.tokenId}</span>
                    <TierBadge tier={t.tier} />
                    {t.soulbound && (
                      <Badge variant="secondary">soulbound</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Minted {formatTimestamp(t.mintedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
          <CardDescription>Accrual since last claim.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Stat
            label="Tier"
            value={viewerTier ?? '—'}
          />
          <Stat
            label="Rate / epoch"
            value={ratePerEpoch.toString()}
          />
          <Stat
            label="Epochs elapsed"
            value={elapsedEpochs.toString()}
          />
          <Stat
            label="Pending"
            value={pendingBenefits.toString()}
          />
          <Stat
            label="Claimed balance"
            value={state.claimedBalance.toString()}
          />
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <CardDescription>Memberships outstanding by tier.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {(['Bronze', 'Silver', 'Gold'] as Tier[]).map((tier) => {
              const meta = tierByName.get(tier);
              const total = state.tiers.reduce((s, t) => s + t.count, 0);
              const pct = total > 0 ? ((meta?.count ?? 0) / total) * 100 : 0;
              return (
                <div key={tier} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <TierBadge tier={tier} />
                    <span className="font-mono">{meta?.count ?? 0}</span>
                  </div>
                  <Progress value={pct} max={100} />
                </div>
              );
            })}
          </div>
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

function TiersTab({
  tiers,
  viewerTier,
}: {
  tiers: TierMeta[];
  viewerTier: Tier | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tiers.map((t) => {
        const isCurrent = viewerTier === t.tier;
        const isUnlocked =
          viewerTier !== null && TIER_RANK[viewerTier] >= TIER_RANK[t.tier];
        return (
          <Card
            key={t.tier}
            className={isCurrent ? 'border-primary border-2' : ''}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t.tier}</CardTitle>
                <TierBadge tier={t.tier} />
              </div>
              <CardDescription>
                {t.ratePerEpoch.toString()} pts / epoch · {t.count} members
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="space-y-1">
                {t.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-2">
                {isCurrent && <Badge>Current tier</Badge>}
                {!isCurrent && isUnlocked && (
                  <Badge variant="secondary">Included</Badge>
                )}
                {!isUnlocked && <Badge variant="outline">Locked</Badge>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AccessTab({
  state,
  viewerTier,
}: {
  state: MembershipState;
  viewerTier: Tier | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
        <CardDescription>
          Live access decisions for the connected viewer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-2">Resource</th>
              <th>Required</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {state.resources.map((r) => {
              const decision = evaluateAccess(
                r,
                viewerTier,
                state.tempGrants,
                state.nowSeconds,
              );
              return (
                <tr key={r.name} className="border-t">
                  <td className="py-2 font-mono">{r.name}</td>
                  <td>
                    <TierBadge tier={r.minTier} />
                  </td>
                  <td>
                    {decision.allowed ? (
                      <Badge>Allowed</Badge>
                    ) : (
                      <Badge variant="destructive">Denied</Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground capitalize">
                    {decision.reason.replace('-', ' ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {state.tempGrants.length > 0 && (
          <div className="mt-4 space-y-1 text-sm">
            <div className="text-muted-foreground">Active temporary grants</div>
            <ul className="space-y-1">
              {state.tempGrants.map((g) => (
                <li key={g.resource} className="font-mono text-xs">
                  {g.resource} · until {formatTimestamp(g.grantedUntil)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BenefitsTabProps {
  state: MembershipState;
  viewerTier: Tier | null;
  pendingBenefits: bigint;
  ratePerEpoch: bigint;
  elapsedEpochs: number;
  busy: boolean;
  onClaim: () => Promise<void>;
  onAdvanceEpochs?: (n: number) => void;
}

function BenefitsTab({
  state,
  viewerTier,
  pendingBenefits,
  ratePerEpoch,
  elapsedEpochs,
  busy,
  onClaim,
  onAdvanceEpochs,
}: BenefitsTabProps) {
  const isRegistered = state.lastClaimEpoch !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim benefits</CardTitle>
        <CardDescription>
          Benefits accrue per epoch based on your tier. The first claim
          registers your accrual start at the current epoch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Tier" value={viewerTier ?? '—'} />
          <Stat label="Rate / epoch" value={ratePerEpoch.toString()} />
          <Stat label="Current epoch" value={state.currentEpoch.toString()} />
          <Stat
            label="Last claim epoch"
            value={state.lastClaimEpoch?.toString() ?? '—'}
          />
          <Stat label="Epochs elapsed" value={elapsedEpochs.toString()} />
          <Stat label="Pending" value={pendingBenefits.toString()} />
          <Stat
            label="Claimed balance"
            value={state.claimedBalance.toString()}
          />
          <Stat
            label="Epoch length"
            value={`${state.epochSeconds}s`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !viewerTier}
            onClick={onClaim}
            title={!viewerTier ? 'Mint a membership first' : undefined}
          >
            {!isRegistered ? 'Register & claim' : 'Claim pending'}
          </Button>
          {onAdvanceEpochs && (
            <>
              <Button variant="outline" onClick={() => onAdvanceEpochs(1)}>
                +1 epoch (sim)
              </Button>
              <Button variant="outline" onClick={() => onAdvanceEpochs(7)}>
                +7 epochs (sim)
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
