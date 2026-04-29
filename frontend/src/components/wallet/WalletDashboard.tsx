import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionKey {
  delegate: string;
  spendLimit: number;
  expiresAt: number; // ledger sequence
  active: boolean;
}

interface Transaction {
  id: string;
  target: string;
  amount: number;
  gasSponsored: boolean;
  timestamp: string;
  status: 'success' | 'pending' | 'failed';
}

interface WalletState {
  address: string;
  owner: string;
  nonce: number;
  guardians: string[];
  threshold: number;
  sessionKeys: SessionKey[];
  transactions: Transaction[];
  sponsorBalance: number;
  walletSpent: number;
  perWalletLimit: number;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_WALLET: WalletState = {
  address: 'GCEZ...W3AB',
  owner: 'GABC...1234',
  nonce: 7,
  guardians: ['GBCD...5678', 'GCDE...9012'],
  threshold: 2,
  sessionKeys: [
    { delegate: 'GDEX...DAPP', spendLimit: 5_000_000, expiresAt: 1500, active: true },
  ],
  transactions: [
    { id: 'tx1', target: 'GXYZ...ABCD', amount: 100_000, gasSponsored: true, timestamp: '2026-04-29 08:00', status: 'success' },
    { id: 'tx2', target: 'GAAA...BBBB', amount: 250_000, gasSponsored: true, timestamp: '2026-04-29 07:30', status: 'success' },
    { id: 'tx3', target: 'GCCC...DDDD', amount: 50_000, gasSponsored: false, timestamp: '2026-04-29 07:00', status: 'pending' },
  ],
  sponsorBalance: 800_000,
  walletSpent: 350_000,
  perWalletLimit: 1_000_000,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function GasSponsorshipIndicator({ spent, limit }: { spent: number; limit: number }) {
  const pct = Math.min(100, Math.round((spent / limit) * 100));
  const color = pct > 80 ? 'text-red-500' : pct > 50 ? 'text-yellow-500' : 'text-green-500';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gas Sponsorship</CardTitle>
        <CardDescription>Sponsored by paymaster — no XLM required</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Used</span>
          <span className={color}>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {(spent / 1e7).toFixed(4)} / {(limit / 1e7).toFixed(4)} XLM
        </p>
      </CardContent>
    </Card>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const statusVariant: Record<Transaction['status'], 'default' | 'secondary' | 'destructive'> = {
    success: 'default',
    pending: 'secondary',
    failed: 'destructive',
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div className="space-y-0.5">
        <p className="font-mono text-xs text-muted-foreground">{tx.target}</p>
        <p className="text-xs text-muted-foreground">{tx.timestamp}</p>
      </div>
      <div className="flex items-center gap-2">
        {tx.gasSponsored && (
          <Badge variant="secondary" className="text-xs">⛽ Sponsored</Badge>
        )}
        <span className="font-medium">{(tx.amount / 1e7).toFixed(4)} XLM</span>
        <Badge variant={statusVariant[tx.status]}>{tx.status}</Badge>
      </div>
    </div>
  );
}

function SessionKeyRow({
  sk,
  onRevoke,
}: {
  sk: SessionKey;
  onRevoke: (delegate: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div>
        <p className="font-mono text-xs">{sk.delegate}</p>
        <p className="text-xs text-muted-foreground">
          Limit: {(sk.spendLimit / 1e7).toFixed(4)} XLM · Expires ledger {sk.expiresAt}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={sk.active ? 'default' : 'destructive'}>
          {sk.active ? 'Active' : 'Expired'}
        </Badge>
        <Button size="sm" variant="destructive" onClick={() => onRevoke(sk.delegate)}>
          Revoke
        </Button>
      </div>
    </div>
  );
}

// ── Recovery dialog ───────────────────────────────────────────────────────────

function RecoveryDialog({
  open,
  onClose,
  guardians,
  threshold,
}: {
  open: boolean;
  onClose: () => void;
  guardians: string[];
  threshold: number;
}) {
  const [newOwner, setNewOwner] = useState('');
  const [votes, setVotes] = useState<string[]>([]);

  function vote(guardian: string) {
    if (!votes.includes(guardian)) setVotes([...votes, guardian]);
  }

  const reached = votes.length >= threshold;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Wallet Recovery</DialogTitle>
        <DialogContent>
          <p className="text-sm text-muted-foreground mb-4">
            {threshold} of {guardians.length} guardians must approve the new owner.
          </p>

          <label className="block text-sm font-medium mb-1">New Owner Address</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm mb-4 font-mono"
            placeholder="G..."
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            aria-label="New owner address"
          />

          <p className="text-sm font-medium mb-2">Guardian Approvals ({votes.length}/{threshold})</p>
          <div className="space-y-2 mb-4">
            {guardians.map((g) => (
              <div key={g} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs">{g}</span>
                {votes.includes(g) ? (
                  <Badge variant="default">✓ Voted</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => vote(g)}>
                    Approve
                  </Button>
                )}
              </div>
            ))}
          </div>

          {reached && (
            <Alert>
              <AlertTitle>Threshold reached</AlertTitle>
              <AlertDescription>
                Recovery can now be executed on-chain for {newOwner || '(no address set)'}.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!reached || !newOwner}>Execute Recovery</Button>
          </div>
        </DialogContent>
      </DialogHeader>
    </Dialog>
  );
}

// ── Add session key dialog ────────────────────────────────────────────────────

function AddSessionKeyDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (delegate: string, limit: number, ttl: number) => void;
}) {
  const [delegate, setDelegate] = useState('');
  const [limit, setLimit] = useState('');
  const [ttl, setTtl] = useState('500');

  function handleAdd() {
    if (!delegate || !limit) return;
    onAdd(delegate, parseFloat(limit) * 1e7, parseInt(ttl));
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Add Session Key</DialogTitle>
        <DialogContent>
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Delegate Address</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                placeholder="G..."
                value={delegate}
                onChange={(e) => setDelegate(e.target.value)}
                aria-label="Delegate address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Spend Limit (XLM)</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                type="number"
                min="0"
                placeholder="0.5"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-label="Spend limit in XLM"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">TTL (ledgers)</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                type="number"
                min="1"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                aria-label="TTL in ledgers"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!delegate || !limit}>Add Key</Button>
          </div>
        </DialogContent>
      </DialogHeader>
    </Dialog>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function WalletDashboard() {
  const [wallet, setWallet] = useState<WalletState>(MOCK_WALLET);
  const [activeTab, setActiveTab] = useState('overview');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [addKeyOpen, setAddKeyOpen] = useState(false);

  function revokeSessionKey(delegate: string) {
    setWallet((w) => ({
      ...w,
      sessionKeys: w.sessionKeys.map((k) =>
        k.delegate === delegate ? { ...k, active: false } : k
      ),
    }));
  }

  function addSessionKey(delegate: string, spendLimit: number, expiresAt: number) {
    setWallet((w) => ({
      ...w,
      sessionKeys: [
        ...w.sessionKeys,
        { delegate, spendLimit, expiresAt, active: true },
      ],
    }));
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Smart Wallet</h1>
          <p className="text-sm font-mono text-muted-foreground">{wallet.address}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRecoveryOpen(true)}>
            Recovery
          </Button>
          <Badge variant="secondary">Nonce: {wallet.nonce}</Badge>
        </div>
      </div>

      {/* Gas indicator */}
      <GasSponsorshipIndicator spent={wallet.walletSpent} limit={wallet.perWalletLimit} />

      {/* Tabs */}
      <Tabs>
        <TabsList>
          <TabsTrigger value="overview" onClick={() => setActiveTab('overview')}>Overview</TabsTrigger>
          <TabsTrigger value="transactions" onClick={() => setActiveTab('transactions')}>Transactions</TabsTrigger>
          <TabsTrigger value="session-keys" onClick={() => setActiveTab('session-keys')}>Session Keys</TabsTrigger>
          <TabsTrigger value="guardians" onClick={() => setActiveTab('guardians')}>Guardians</TabsTrigger>
        </TabsList>

        {/* Overview */}
        {activeTab === 'overview' && (
          <TabsContent value="overview">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-mono">{wallet.owner}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Guardians</span>
                  <span>{wallet.guardians.length} ({wallet.threshold}-of-{wallet.guardians.length})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active session keys</span>
                  <span>{wallet.sessionKeys.filter((k) => k.active).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sponsor balance</span>
                  <span className="text-green-600">{(wallet.sponsorBalance / 1e7).toFixed(4)} XLM</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Transactions */}
        {activeTab === 'transactions' && (
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {wallet.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions yet.</p>
                ) : (
                  wallet.transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Session keys */}
        {activeTab === 'session-keys' && (
          <TabsContent value="session-keys">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Session Keys</CardTitle>
                <Button size="sm" onClick={() => setAddKeyOpen(true)}>+ Add Key</Button>
              </CardHeader>
              <CardContent>
                {wallet.sessionKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No session keys.</p>
                ) : (
                  wallet.sessionKeys.map((sk) => (
                    <SessionKeyRow key={sk.delegate} sk={sk} onRevoke={revokeSessionKey} />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Guardians */}
        {activeTab === 'guardians' && (
          <TabsContent value="guardians">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Guardians</CardTitle>
                <CardDescription>
                  {wallet.threshold}-of-{wallet.guardians.length} required for recovery
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {wallet.guardians.map((g, i) => (
                  <div key={g} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="text-muted-foreground">Guardian {i + 1}</span>
                    <span className="font-mono text-xs">{g}</span>
                  </div>
                ))}
                <Alert className="mt-3">
                  <AlertTitle>Recovery</AlertTitle>
                  <AlertDescription>
                    Use the Recovery button to initiate a guardian-approved owner change.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <RecoveryDialog
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        guardians={wallet.guardians}
        threshold={wallet.threshold}
      />
      <AddSessionKeyDialog
        open={addKeyOpen}
        onClose={() => setAddKeyOpen(false)}
        onAdd={addSessionKey}
      />
    </div>
  );
}

export default WalletDashboard;
