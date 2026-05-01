import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Alert } from '@/components/ui/Alert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionKey {
  address: string;
  expiryLedger: number;
  spendLimit: number;
  spent: number;
}

interface Transaction {
  id: string;
  target: string;
  function: string;
  value: number;
  nonce: number;
  status: 'pending' | 'success' | 'failed';
  gasSponsored: boolean;
  timestamp: string;
}

interface WalletState {
  owner: string;
  nonce: number;
  locked: boolean;
  threshold: number;
  signers: string[];
  sessionKeys: SessionKey[];
  transactions: Transaction[];
  sponsorBalance: number;
  gasSponsored: boolean;
}

// ---------------------------------------------------------------------------
// Mock initial state (replace with real contract calls)
// ---------------------------------------------------------------------------

const MOCK_STATE: WalletState = {
  owner: 'GABC...1234',
  nonce: 7,
  locked: false,
  threshold: 2,
  signers: ['GABC...1234', 'GDEF...5678'],
  sessionKeys: [
    { address: 'GSESS...AAAA', expiryLedger: 5000000, spendLimit: 1000, spent: 250 },
  ],
  transactions: [
    {
      id: 'tx-1',
      target: 'GCERT...ABCD',
      function: 'issue_certificate',
      value: 0,
      nonce: 6,
      status: 'success',
      gasSponsored: true,
      timestamp: '2026-04-29 08:12',
    },
    {
      id: 'tx-2',
      target: 'GTOKEN...EFGH',
      function: 'transfer',
      value: 100,
      nonce: 5,
      status: 'success',
      gasSponsored: false,
      timestamp: '2026-04-28 17:45',
    },
  ],
  sponsorBalance: 8500,
  gasSponsored: true,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GasIndicator({ sponsored, balance }: { sponsored: boolean; balance: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${sponsored ? 'bg-green-500' : 'bg-yellow-500'}`}
        aria-hidden="true"
      />
      {sponsored ? (
        <span className="text-green-700 dark:text-green-400">
          Gas sponsored · {balance.toLocaleString()} stroops remaining
        </span>
      ) : (
        <span className="text-yellow-700 dark:text-yellow-400">Gas not sponsored</span>
      )}
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const statusColor: Record<Transaction['status'], string> = {
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-muted-foreground">{tx.target}</p>
        <p className="text-sm font-medium">{tx.function}</p>
        <p className="text-xs text-muted-foreground">
          nonce #{tx.nonce} · {tx.timestamp}
        </p>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {tx.gasSponsored && (
          <Badge variant="secondary" className="text-xs">
            Sponsored
          </Badge>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[tx.status]}`}>
          {tx.status}
        </span>
      </div>
    </div>
  );
}

function SessionKeyRow({
  sk,
  onRevoke,
}: {
  sk: SessionKey;
  onRevoke: (address: string) => void;
}) {
  const usedPct = sk.spendLimit > 0 ? Math.round((sk.spent / sk.spendLimit) * 100) : 0;
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{sk.address}</p>
        <p className="text-xs text-muted-foreground">
          Expires ledger {sk.expiryLedger.toLocaleString()} · spend {usedPct}% used
        </p>
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="ml-4 flex-shrink-0"
        onClick={() => onRevoke(sk.address)}
      >
        Revoke
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recovery flow modal (inline)
// ---------------------------------------------------------------------------

function RecoveryPanel({
  locked,
  onPropose,
}: {
  locked: boolean;
  onPropose: (newOwner: string) => void;
}) {
  const [newOwner, setNewOwner] = useState('');

  return (
    <div className="space-y-4">
      {locked && (
        <Alert variant="destructive">
          Wallet is locked — a recovery is in progress. Guardians must reach threshold to complete.
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Guardians can propose a new owner. Once the recovery threshold is reached the wallet
        ownership transfers automatically.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="New owner address (G...)"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          aria-label="New owner address"
        />
        <Button
          onClick={() => {
            if (newOwner.trim()) {
              onPropose(newOwner.trim());
              setNewOwner('');
            }
          }}
          disabled={!newOwner.trim()}
        >
          Propose
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add session key form
// ---------------------------------------------------------------------------

function AddSessionKeyForm({ onAdd }: { onAdd: (sk: Omit<SessionKey, 'spent'>) => void }) {
  const [address, setAddress] = useState('');
  const [expiry, setExpiry] = useState('');
  const [limit, setLimit] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !expiry) return;
    onAdd({
      address,
      expiryLedger: parseInt(expiry, 10),
      spendLimit: limit ? parseInt(limit, 10) : 0,
    });
    setAddress('');
    setExpiry('');
    setLimit('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:col-span-3"
          placeholder="Session key address (G...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          aria-label="Session key address"
        />
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Expiry ledger"
          type="number"
          min={1}
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          required
          aria-label="Expiry ledger"
        />
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Spend limit (0 = unlimited)"
          type="number"
          min={0}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          aria-label="Spend limit"
        />
        <Button type="submit" disabled={!address || !expiry}>
          Add Key
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function WalletDashboard() {
  const [wallet, setWallet] = useState<WalletState>(MOCK_STATE);
  const [activeTab, setActiveTab] = useState('overview');
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleRevokeSessionKey = (address: string) => {
    setWallet((prev) => ({
      ...prev,
      sessionKeys: prev.sessionKeys.filter((sk) => sk.address !== address),
    }));
    showNotice(`Session key ${address} revoked.`);
  };

  const handleAddSessionKey = (sk: Omit<SessionKey, 'spent'>) => {
    setWallet((prev) => ({
      ...prev,
      sessionKeys: [...prev.sessionKeys, { ...sk, spent: 0 }],
    }));
    showNotice('Session key added.');
  };

  const handleProposeRecovery = (newOwner: string) => {
    setWallet((prev) => ({ ...prev, locked: true }));
    showNotice(`Recovery proposed for ${newOwner}. Awaiting guardian approvals.`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Smart Wallet</h1>
          <p className="font-mono text-sm text-muted-foreground">{wallet.owner}</p>
        </div>
        <div className="flex items-center gap-3">
          <GasIndicator sponsored={wallet.gasSponsored} balance={wallet.sponsorBalance} />
          {wallet.locked && (
            <Badge variant="destructive" className="animate-pulse">
              Locked
            </Badge>
          )}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <Alert variant="default" className="border-green-500 text-green-700">
          {notice}
        </Alert>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Nonce', value: wallet.nonce },
          { label: 'Threshold', value: `${wallet.threshold}-of-${wallet.signers.length}` },
          { label: 'Session Keys', value: wallet.sessionKeys.length },
          { label: 'Transactions', value: wallet.transactions.length },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs>
        <TabsList className="w-full justify-start">
          {['overview', 'transactions', 'session-keys', 'recovery'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              data-state={activeTab === tab ? 'active' : 'inactive'}
              onClick={() => setActiveTab(tab)}
            >
              {tab.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" hidden={activeTab !== 'overview'}>
          <Card>
            <CardHeader>
              <CardTitle>Wallet Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-mono">{wallet.owner}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Multisig</p>
                  <p>
                    {wallet.threshold}-of-{wallet.signers.length} signers
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Nonce</p>
                  <p>{wallet.nonce}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sponsor Balance</p>
                  <p>{wallet.sponsorBalance.toLocaleString()} stroops</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Signers</p>
                <ul className="space-y-1">
                  {wallet.signers.map((s) => (
                    <li key={s} className="font-mono text-xs">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions" hidden={activeTab !== 'transactions'}>
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
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

        {/* Session Keys */}
        <TabsContent value="session-keys" hidden={activeTab !== 'session-keys'}>
          <Card>
            <CardHeader>
              <CardTitle>Session Keys</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddSessionKeyForm onAdd={handleAddSessionKey} />
              {wallet.sessionKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active session keys.</p>
              ) : (
                wallet.sessionKeys.map((sk) => (
                  <SessionKeyRow key={sk.address} sk={sk} onRevoke={handleRevokeSessionKey} />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recovery */}
        <TabsContent value="recovery" hidden={activeTab !== 'recovery'}>
          <Card>
            <CardHeader>
              <CardTitle>Wallet Recovery</CardTitle>
            </CardHeader>
            <CardContent>
              <RecoveryPanel locked={wallet.locked} onPropose={handleProposeRecovery} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default WalletDashboard;
