import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Pool {
  id: number;
  name: string;
  reserveIn: number;
  reserveOut: number;
  feeBps: number;
  gasCost: number;
}

interface RouteStep {
  poolId: number;
  poolName: string;
  allocation: number;
  output: number;
  gasCost: number;
}

interface Quote {
  amountIn: number;
  grossOut: number;
  netOut: number;
  totalGas: number;
  poolsUsed: number;
  improvementBps: number;
  route: RouteStep[];
}

interface Trade {
  id: string;
  timestamp: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  netOut: number;
  poolsUsed: number;
  improvementBps: number;
  status: 'pending' | 'success' | 'failed';
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_POOLS: Pool[] = [
  { id: 0, name: 'Pool A', reserveIn: 1_000_000, reserveOut: 1_000_000, feeBps: 30, gasCost: 50 },
  { id: 1, name: 'Pool B', reserveIn: 800_000, reserveOut: 1_200_000, feeBps: 25, gasCost: 60 },
  { id: 2, name: 'Pool C', reserveIn: 1_200_000, reserveOut: 900_000, feeBps: 30, gasCost: 55 },
];

const MOCK_TRADES: Trade[] = [
  {
    id: 'tx-1',
    timestamp: '2026-04-29 09:45',
    tokenIn: 'XLM',
    tokenOut: 'USDC',
    amountIn: 10_000,
    netOut: 9_950,
    poolsUsed: 2,
    improvementBps: 120,
    status: 'success',
  },
  {
    id: 'tx-2',
    timestamp: '2026-04-28 14:20',
    tokenIn: 'USDC',
    tokenOut: 'XLM',
    amountIn: 5_000,
    netOut: 5_020,
    poolsUsed: 1,
    improvementBps: 0,
    status: 'success',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatBps(bps: number): string {
  return (bps / 100).toFixed(2) + '%';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RouteVisualization({ route }: { route: RouteStep[] }) {
  const total = route.reduce((s, r) => s + r.allocation, 0);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Route Breakdown</p>
      {route.map((step) => {
        const pct = total > 0 ? Math.round((step.allocation / total) * 100) : 0;
        return (
          <div key={step.poolId} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{step.poolName}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatNumber(step.allocation)} ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Output: {formatNumber(step.output)} · Gas: {formatNumber(step.gasCost)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PriceComparison({ quote }: { quote: Quote | null }) {
  if (!quote) return null;
  const singlePoolOut = quote.grossOut - quote.improvementBps * quote.grossOut / 10_000;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">Best Single Pool</p>
        <p className="font-semibold tabular-nums">{formatNumber(singlePoolOut)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Split Route</p>
        <p className="font-semibold tabular-nums text-green-600">{formatNumber(quote.netOut)}</p>
      </div>
      {quote.improvementBps > 0 && (
        <div className="col-span-2 flex items-center gap-2 border-t pt-2">
          <Badge variant="default" className="text-xs">
            +{formatBps(quote.improvementBps)} better
          </Badge>
          <span className="text-xs text-muted-foreground">
            Saved: {formatNumber(quote.netOut - singlePoolOut)}
          </span>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const statusColor: Record<Trade['status'], string> = {
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {formatNumber(trade.amountIn)} {trade.tokenIn} → {formatNumber(trade.netOut)} {trade.tokenOut}
        </p>
        <p className="text-xs text-muted-foreground">
          {trade.timestamp} · {trade.poolsUsed} pool{trade.poolsUsed > 1 ? 's' : ''}
        </p>
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
        {trade.improvementBps > 0 && (
          <Badge variant="secondary" className="text-xs">
            +{formatBps(trade.improvementBps)}
          </Badge>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[trade.status]}`}>
          {trade.status}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main interface
// ---------------------------------------------------------------------------

export function AggregatorInterface() {
  const [tokenIn, setTokenIn] = useState('XLM');
  const [tokenOut, setTokenOut] = useState('USDC');
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [trades] = useState<Trade[]>(MOCK_TRADES);
  const [activeTab, setActiveTab] = useState('swap');
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleGetQuote = () => {
    const amount = parseFloat(amountIn);
    if (!amount || amount <= 0) return;

    // Mock quote calculation
    const grossOut = amount * 0.995;
    const totalGas = 150;
    const netOut = grossOut - totalGas;
    const improvementBps = 120;

    const route: RouteStep[] = [
      { poolId: 0, poolName: 'Pool A', allocation: amount * 0.6, output: netOut * 0.6, gasCost: 50 },
      { poolId: 1, poolName: 'Pool B', allocation: amount * 0.4, output: netOut * 0.4, gasCost: 60 },
    ];

    setQuote({
      amountIn: amount,
      grossOut,
      netOut,
      totalGas,
      poolsUsed: 2,
      improvementBps,
      route,
    });
  };

  const handleExecute = () => {
    if (!quote) return;
    showNotice(`Swap executed: ${formatNumber(quote.amountIn)} ${tokenIn} → ${formatNumber(quote.netOut)} ${tokenOut}`);
    setQuote(null);
    setAmountIn('');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">DEX Aggregator</h1>
        <p className="text-sm text-muted-foreground">Best price routing across multiple pools</p>
      </div>

      {notice && <Alert variant="default">{notice}</Alert>}

      <Tabs>
        <TabsList className="w-full justify-start">
          {['swap', 'pools', 'history'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              data-state={activeTab === tab ? 'active' : 'inactive'}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Swap */}
        <TabsContent value="swap" hidden={activeTab !== 'swap'}>
          <Card>
            <CardHeader>
              <CardTitle>Swap Tokens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">You pay</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="0.00"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    aria-label="Amount to swap"
                  />
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={tokenIn}
                    onChange={(e) => setTokenIn(e.target.value)}
                    aria-label="Input token"
                  >
                    <option>XLM</option>
                    <option>USDC</option>
                    <option>BTC</option>
                  </select>
                </div>
              </div>

              {/* Output */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">You receive</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
                    placeholder="0.00"
                    value={quote ? formatNumber(quote.netOut) : ''}
                    readOnly
                    aria-label="Amount to receive"
                  />
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={tokenOut}
                    onChange={(e) => setTokenOut(e.target.value)}
                    aria-label="Output token"
                  >
                    <option>USDC</option>
                    <option>XLM</option>
                    <option>BTC</option>
                  </select>
                </div>
              </div>

              <Button className="w-full" onClick={handleGetQuote} disabled={!amountIn}>
                Get Quote
              </Button>

              {quote && (
                <>
                  <PriceComparison quote={quote} />
                  <RouteVisualization route={quote.route} />
                  <div className="flex items-center justify-between rounded-md border p-3 text-xs">
                    <span className="text-muted-foreground">Total gas cost</span>
                    <span className="font-medium tabular-nums">{formatNumber(quote.totalGas)}</span>
                  </div>
                  <Button className="w-full" variant="default" onClick={handleExecute}>
                    Execute Swap
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pools */}
        <TabsContent value="pools" hidden={activeTab !== 'pools'}>
          <Card>
            <CardHeader>
              <CardTitle>Registered Pools</CardTitle>
            </CardHeader>
            <CardContent>
              {MOCK_POOLS.map((pool) => (
                <div key={pool.id} className="flex items-center justify-between border-b py-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{pool.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Fee: {formatBps(pool.feeBps)} · Gas: {formatNumber(pool.gasCost)}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">Reserves</p>
                    <p className="font-mono">{formatNumber(pool.reserveIn)} / {formatNumber(pool.reserveOut)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" hidden={activeTab !== 'history'}>
          <Card>
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trades yet.</p>
              ) : (
                trades.map((trade) => <TradeRow key={trade.id} trade={trade} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AggregatorInterface;
