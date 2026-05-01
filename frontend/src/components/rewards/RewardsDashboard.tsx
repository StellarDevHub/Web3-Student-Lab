'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDistanceToNow, formatNumber } from '@/lib/utils';
import { AlertTriangle, ArrowRightLeft, Clock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PointsData {
  balance: number; lifetimeEarned: number; expiringSoon: number; conversionRate: number;
  conversions: { points: number; tokens: number; timestamp: number }[];
}

export default function RewardsDashboard() {
  const [points, setPoints] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [convertAmount, setConvertAmount] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const res = await api.get('/rewards'); setPoints(res.data); } catch {} finally { setLoading(false); }
  };

  const handleConvert = async () => {
    await api.post('/rewards/convert', { points: parseInt(convertAmount) });
    setConvertAmount(''); fetchData();
  };

  if (loading) return <div className="flex justify-center min-h-[400px] items-center"><div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Rewards</h1><p className="text-muted-foreground">Track points and convert to tokens</p></div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Your Balance</p><p className="text-2xl font-bold">{formatNumber(points?.balance || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Lifetime Earned</p><p className="text-2xl font-bold">{formatNumber(points?.lifetimeEarned || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Conversion Rate</p><p className="text-2xl font-bold">1:{points?.conversionRate || '—'}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expiring Soon</p><p className="text-2xl font-bold text-orange-500">{formatNumber(points?.expiringSoon || 0)}</p></CardContent></Card>
      </div>

      {points && points.expiringSoon > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <span className="text-sm text-orange-700">{formatNumber(points.expiringSoon)} points expire soon — convert them before they're gone!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Convert Points</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="number" placeholder="Points to convert" value={convertAmount} onChange={e => setConvertAmount(e.target.value)} />
            {convertAmount && <p className="text-xs text-muted-foreground">You'll receive {Math.floor(parseInt(convertAmount) / (points?.conversionRate || 1))} tokens</p>}
            <Button onClick={handleConvert} className="w-full" disabled={!convertAmount}>Convert</Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Conversion History</CardTitle></CardHeader>
          <CardContent>
            {!points?.conversions?.length ? <p className="text-muted-foreground text-center py-6">No conversions yet</p> :
              <div className="space-y-2">
                {points.conversions.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex justify-between p-2 bg-muted/50 rounded text-sm">
                    <span>{formatNumber(c.points)} pts → {formatNumber(c.tokens)} tokens</span>
                    <span className="text-muted-foreground">{formatDistanceToNow(c.timestamp)}</span>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

// ── Types ──────────────────────────────────────────────────────────────────

interface PointsBalance {
  available: number;
  lifetimeEarned: number;
  lifetimeExpired: number;
}

interface PointsBatch {
  amount: number;
  earnedAt: number; // ledger
  expiresAt: number; // ledger
}

interface HistoryEntry {
  delta: number;
  reason: string;
  ledger: number;
}

interface ConversionRecord {
  pointsSpent: number;
  tokensMinted: number;
  ledger: number;
}

interface ConversionConfig {
  pointsPerToken: number;
  maxPerCall: number;
  dailyCap: number;
}

// ── Mock data (replace with actual Soroban RPC calls) ─────────────────────

const MOCK_BALANCE: PointsBalance = {
  available: 3_450,
  lifetimeEarned: 12_000,
  lifetimeExpired: 550,
};

const MOCK_BATCHES: PointsBatch[] = [
  { amount: 500, earnedAt: 1_000_000, expiresAt: 1_100_000 },
  { amount: 1_200, earnedAt: 1_050_000, expiresAt: 1_150_000 },
  { amount: 1_750, earnedAt: 1_080_000, expiresAt: 1_200_000 },
];

const MOCK_HISTORY: HistoryEntry[] = [
  { delta: 500, reason: "course_complete", ledger: 1_000_000 },
  { delta: 1_200, reason: "quiz_bonus", ledger: 1_050_000 },
  { delta: -300, reason: "convert", ledger: 1_060_000 },
  { delta: 1_750, reason: "hackathon", ledger: 1_080_000 },
  { delta: -550, reason: "expired", ledger: 1_090_000 },
];

const MOCK_CONVERSIONS: ConversionRecord[] = [
  { pointsSpent: 300, tokensMinted: 3, ledger: 1_060_000 },
];

const MOCK_CONFIG: ConversionConfig = {
  pointsPerToken: 100,
  maxPerCall: 1_000,
  dailyCap: 5_000,
};

const CURRENT_LEDGER = 1_095_000;
const DAILY_REMAINING = 4_997;

// ── Helpers ────────────────────────────────────────────────────────────────

function ledgersToHours(ledgers: number): string {
  const hours = Math.round((ledgers * 5) / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function expiryLabel(expiresAt: number): { label: string; urgent: boolean } {
  const remaining = expiresAt - CURRENT_LEDGER;
  if (remaining <= 0) return { label: "Expired", urgent: true };
  const urgent = remaining < 17_280; // < 1 day
  return { label: `Expires in ${ledgersToHours(remaining)}`, urgent };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BalanceSummary({ balance }: { balance: PointsBalance }) {
  const usedPct = Math.round(
    (balance.lifetimeExpired / Math.max(balance.lifetimeEarned, 1)) * 100
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Points Balance</CardTitle>
        <CardDescription>Your on-chain reward points</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-4xl font-bold text-primary">
          {balance.available.toLocaleString()}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            pts
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Lifetime earned</p>
            <p className="font-semibold">
              {balance.lifetimeEarned.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Expired</p>
            <p className="font-semibold text-destructive">
              {balance.lifetimeExpired.toLocaleString()}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {usedPct}% expired of lifetime
          </p>
          <Progress value={usedPct} />
        </div>
      </CardContent>
    </Card>
  );
}

function ExpiryAlerts({ batches }: { batches: PointsBatch[] }) {
  const urgent = batches.filter(
    (b) => b.expiresAt - CURRENT_LEDGER < 17_280 && b.expiresAt > CURRENT_LEDGER
  );
  if (urgent.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>⚠ Points expiring soon</AlertTitle>
      <AlertDescription>
        {urgent.reduce((s, b) => s + b.amount, 0).toLocaleString()} points will
        expire within 24 hours. Convert or use them before they are lost.
      </AlertDescription>
    </Alert>
  );
}

function BatchList({ batches }: { batches: PointsBatch[] }) {
  return (
    <div className="space-y-2">
      {batches.map((b, i) => {
        const { label, urgent } = expiryLabel(b.expiresAt);
        return (
          <div
            key={i}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <span className="font-medium">{b.amount.toLocaleString()} pts</span>
            <Badge variant={urgent ? "destructive" : "secondary"}>{label}</Badge>
          </div>
        );
      })}
    </div>
  );
}

function ConversionPanel({
  balance,
  config,
  dailyRemaining,
  onConvert,
  loading,
}: {
  balance: PointsBalance;
  config: ConversionConfig;
  dailyRemaining: number;
  onConvert: (tokens: number) => void;
  loading: boolean;
}) {
  const [tokenAmount, setTokenAmount] = useState(1);
  const pointsNeeded = tokenAmount * config.pointsPerToken;
  const canConvert =
    tokenAmount > 0 &&
    tokenAmount <= config.maxPerCall &&
    tokenAmount <= dailyRemaining &&
    pointsNeeded <= balance.available;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convert Points → Tokens</CardTitle>
        <CardDescription>
          Rate: {config.pointsPerToken} pts = 1 token · Daily cap:{" "}
          {config.dailyCap.toLocaleString()} tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium" htmlFor="token-amount">
            Tokens to mint
          </label>
          <input
            id="token-amount"
            type="number"
            min={1}
            max={Math.min(config.maxPerCall, dailyRemaining)}
            value={tokenAmount}
            onChange={(e) => setTokenAmount(Number(e.target.value))}
            className="w-28 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Points required:{" "}
          <span className="font-semibold text-foreground">
            {pointsNeeded.toLocaleString()}
          </span>{" "}
          / {balance.available.toLocaleString()} available
        </p>
        <p className="text-sm text-muted-foreground">
          Daily remaining:{" "}
          <span className="font-semibold text-foreground">
            {dailyRemaining.toLocaleString()}
          </span>{" "}
          tokens
        </p>
        <Button
          disabled={!canConvert || loading}
          onClick={() => onConvert(tokenAmount)}
        >
          {loading ? "Converting…" : "Convert"}
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Ledger</th>
            <th className="px-4 py-2 text-left">Reason</th>
            <th className="px-4 py-2 text-right">Delta</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((e, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">
                {e.ledger.toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline">{e.reason}</Badge>
              </td>
              <td
                className={`px-4 py-2 text-right font-semibold ${
                  e.delta >= 0 ? "text-green-600" : "text-destructive"
                }`}
              >
                {e.delta >= 0 ? "+" : ""}
                {e.delta.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionHistory({ records }: { records: ConversionRecord[] }) {
  if (records.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No conversions yet.</p>
    );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Ledger</th>
            <th className="px-4 py-2 text-right">Points spent</th>
            <th className="px-4 py-2 text-right">Tokens minted</th>
          </tr>
        </thead>
        <tbody>
          {[...records].reverse().map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">
                {r.ledger.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">
                {r.pointsSpent.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right font-semibold text-green-600">
                +{r.tokensMinted.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RewardsDashboard() {
  const [tab, setTab] = useState("overview");
  const [balance, setBalance] = useState<PointsBalance>(MOCK_BALANCE);
  const [batches] = useState<PointsBatch[]>(MOCK_BATCHES);
  const [history, setHistory] = useState<HistoryEntry[]>(MOCK_HISTORY);
  const [conversions, setConversions] =
    useState<ConversionRecord[]>(MOCK_CONVERSIONS);
  const [dailyRemaining, setDailyRemaining] = useState(DAILY_REMAINING);
  const [converting, setConverting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Simulate expiry check on mount
  useEffect(() => {
    const expired = batches
      .filter((b) => b.expiresAt <= CURRENT_LEDGER)
      .reduce((s, b) => s + b.amount, 0);
    if (expired > 0) {
      setBalance((prev) => ({
        ...prev,
        available: prev.available - expired,
        lifetimeExpired: prev.lifetimeExpired + expired,
      }));
    }
  }, [batches]);

  const handleConvert = useCallback(
    async (tokenAmount: number) => {
      setConverting(true);
      setSuccessMsg(null);
      // Simulate async contract call
      await new Promise((r) => setTimeout(r, 800));
      const pointsSpent = tokenAmount * MOCK_CONFIG.pointsPerToken;
      setBalance((prev) => ({
        ...prev,
        available: prev.available - pointsSpent,
      }));
      setHistory((prev) => [
        ...prev,
        {
          delta: -pointsSpent,
          reason: "convert",
          ledger: CURRENT_LEDGER + 1,
        },
      ]);
      setConversions((prev) => [
        ...prev,
        {
          pointsSpent,
          tokensMinted: tokenAmount,
          ledger: CURRENT_LEDGER + 1,
        },
      ]);
      setDailyRemaining((prev) => prev - tokenAmount);
      setSuccessMsg(`Converted ${pointsSpent} pts → ${tokenAmount} tokens`);
      setConverting(false);
    },
    []
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Rewards</h1>
        <p className="text-muted-foreground">
          Earn points, track expiry, and convert to tokens on-chain.
        </p>
      </div>

      <ExpiryAlerts batches={batches} />

      {successMsg && (
        <Alert>
          <AlertTitle>✓ Success</AlertTitle>
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      <Tabs>
        <TabsList>
          {["overview", "convert", "history"].map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              data-state={tab === t ? "active" : "inactive"}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className={tab !== "overview" ? "hidden" : ""}>
          <div className="mt-4 space-y-4">
            <BalanceSummary balance={balance} />
            <Card>
              <CardHeader>
                <CardTitle>Active Batches</CardTitle>
                <CardDescription>
                  Points are grouped by earn event and expire independently.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BatchList batches={batches.filter((b) => b.expiresAt > CURRENT_LEDGER)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="convert" className={tab !== "convert" ? "hidden" : ""}>
          <div className="mt-4">
            <ConversionPanel
              balance={balance}
              config={MOCK_CONFIG}
              dailyRemaining={dailyRemaining}
              onConvert={handleConvert}
              loading={converting}
            />
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Conversion history</h3>
              <ConversionHistory records={conversions} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className={tab !== "history" ? "hidden" : ""}>
          <div className="mt-4">
            <HistoryTable entries={history} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
