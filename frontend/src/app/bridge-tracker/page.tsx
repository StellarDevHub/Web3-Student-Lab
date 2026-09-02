'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useBridgeTracker } from '@/lib/bridge/useBridgeTracker';
import type { BridgeStatus, BridgeTransaction } from '@/lib/bridge/types';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface BridgeStep {
  key: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp?: Date;
  txHash?: string;
  explorerUrl?: string;
}

export default function BridgeTransactionTracker() {
  const [selectedTransaction, setSelectedTransaction] = useState<BridgeTransaction | null>(null);
  const [searchId, setSearchId] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const {
    transactions,
    loading,
    refreshing,
    error,
    configured,
    usingLocalFixtures,
    refresh,
  } = useBridgeTracker({ autoRefresh });

  useEffect(() => {
    if (!selectedTransaction) return;
    const nextSelected = transactions.find((tx) => tx.id === selectedTransaction.id);
    if (nextSelected) setSelectedTransaction(nextSelected);
  }, [selectedTransaction, transactions]);

  const filteredTransactions = transactions.filter((tx) => {
    const query = searchId.toLowerCase();
    return (
      tx.id.toLowerCase().includes(query) ||
      tx.sender.toLowerCase().includes(query) ||
      tx.recipient.toLowerCase().includes(query)
    );
  });

  const selectedSteps = selectedTransaction ? getBridgeSteps(selectedTransaction) : [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cross-Chain Bridge Tracker</h1>
          <p className="text-muted-foreground">
            Monitor live bridge status data from configured SEP-6, SEP-24, or compatible endpoints
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh((value) => !value)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refreshing' : 'Auto-refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowHelpDialog(true)}>
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bridge Transaction Help</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Track transactions from anchor `/transactions` and `/transaction` endpoints.
                </p>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold">Status Mapping</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Pending anchor statuses map to Pending Anchor.</li>
                    <li>Pending Stellar or external network statuses map to On Chain.</li>
                    <li>Completed, failed, and refunded statuses map directly.</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold">Configuration</h4>
                  <p className="text-sm text-muted-foreground">
                    Set NEXT_PUBLIC_BRIDGE_ENDPOINTS to a JSON array of bridge endpoint configs.
                    Local fixtures are only shown during development when no endpoints are present.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!configured && usingLocalFixtures && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Local development fixtures are shown because no bridge endpoint is configured.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Bridge Transactions
            </CardTitle>
            <CardDescription>Click a transaction to view detailed status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="search">Search by ID or address</Label>
              <Input
                id="search"
                placeholder="Transaction ID or address..."
                value={searchId}
                onChange={(event) => setSearchId(event.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading live bridge statuses
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {transactions.length === 0
                    ? 'No bridge transactions found.'
                    : 'No bridge transactions match your search.'}
                </div>
              ) : (
                filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTransaction?.id === transaction.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedTransaction(transaction)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(transaction.status)}
                        <span className="font-semibold text-sm">{transaction.id}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {transaction.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        {transaction.amount} {transaction.asset}
                      </div>
                      <div>
                        {transaction.sourceChain} to {transaction.targetChain}
                      </div>
                      {transaction.serviceName && <div>{transaction.serviceName}</div>}
                      <div>{transaction.timestamp.toLocaleTimeString()}</div>
                    </div>
                    <div className="mt-2">
                      <Progress value={getProgressPercentage(transaction)} className="h-1" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {selectedTransaction ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getStatusIcon(selectedTransaction.status)}
                  Transaction Details - {selectedTransaction.id}
                </CardTitle>
                <CardDescription>
                  {selectedTransaction.amount} {selectedTransaction.asset} from{' '}
                  {selectedTransaction.sourceChain} to {selectedTransaction.targetChain}
                  {selectedTransaction.rawStatus ? ` (${selectedTransaction.rawStatus})` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="progress" className="w-full">
                  <TabsList>
                    <TabsTrigger value="progress">Progress</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="explorers">Explorers</TabsTrigger>
                  </TabsList>

                  <TabsContent value="progress" className="space-y-4">
                    <div className="space-y-4">
                      {selectedSteps.map((step, index) => (
                        <div key={step.key} className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                step.status === 'completed'
                                  ? 'bg-green-100 text-green-600'
                                  : step.status === 'active'
                                    ? 'bg-blue-100 text-blue-600'
                                    : step.status === 'error'
                                      ? 'bg-red-100 text-red-600'
                                      : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {step.status === 'completed' ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : step.status === 'active' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : step.status === 'error' ? (
                                <XCircle className="h-4 w-4" />
                              ) : (
                                <Clock className="h-4 w-4" />
                              )}
                            </div>
                            {index < selectedSteps.length - 1 && (
                              <div
                                className={`w-0.5 h-8 ml-4 mt-2 ${
                                  step.status === 'completed' ? 'bg-green-200' : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </div>
                          <div className="flex-grow">
                            <div className="font-semibold">{step.title}</div>
                            <div className="text-sm text-muted-foreground">{step.description}</div>
                            {step.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {step.timestamp.toLocaleString()}
                              </div>
                            )}
                            {step.txHash && step.explorerUrl && (
                              <div className="mt-2">
                                <Button variant="outline" size="sm" asChild>
                                  <a
                                    href={step.explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View on Explorer
                                  </a>
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedTransaction.estimatedCompletion && (
                      <Alert>
                        <Clock className="h-4 w-4" />
                        <AlertDescription>
                          User action required by:{' '}
                          {selectedTransaction.estimatedCompletion.toLocaleString()}
                        </AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Detail label="Transaction ID" value={selectedTransaction.id} mono />
                      <div>
                        <Label>Status</Label>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(selectedTransaction.status)}
                          <span className="capitalize">
                            {selectedTransaction.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      {selectedTransaction.serviceName && (
                        <Detail label="Bridge Service" value={selectedTransaction.serviceName} />
                      )}
                      {selectedTransaction.protocol && (
                        <Detail label="Protocol" value={selectedTransaction.protocol.toUpperCase()} />
                      )}
                      <Detail
                        label="Amount"
                        value={`${selectedTransaction.amount} ${selectedTransaction.asset}`}
                      />
                      <Detail label="Started" value={selectedTransaction.timestamp.toLocaleString()} />
                      <Detail label="Source Chain" value={selectedTransaction.sourceChain} />
                      <Detail label="Target Chain" value={selectedTransaction.targetChain} />
                      <Detail label="Sender" value={selectedTransaction.sender} mono />
                      <Detail label="Recipient" value={selectedTransaction.recipient} mono />
                    </div>

                    {selectedTransaction.errorMessage && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{selectedTransaction.errorMessage}</AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>

                  <TabsContent value="explorers" className="space-y-4">
                    <ExplorerRow
                      label="Source Transaction"
                      chain={selectedTransaction.sourceChain}
                      txHash={selectedTransaction.sourceTxHash}
                    />
                    <ExplorerRow
                      label="Target Transaction"
                      chain={selectedTransaction.targetChain}
                      txHash={selectedTransaction.targetTxHash}
                    />
                    <ExplorerRow
                      label="Refund Transaction"
                      chain={selectedTransaction.sourceChain}
                      txHash={selectedTransaction.refundTxHash}
                    />
                    {!selectedTransaction.sourceTxHash &&
                      !selectedTransaction.targetTxHash &&
                      !selectedTransaction.refundTxHash && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No explorer transactions are available yet.
                        </div>
                      )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowRightLeft className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Select a transaction from the list to view its details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>{value}</p>
    </div>
  );
}

function ExplorerRow({
  label,
  chain,
  txHash,
}: {
  label: string;
  chain: string;
  txHash?: string;
}) {
  if (!txHash) return null;

  const url = getExplorerUrl(chain, txHash);

  return (
    <div className="flex items-center justify-between gap-3 p-3 border rounded-lg">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-muted-foreground">{chain}</div>
        <div className="font-mono text-xs mt-1 break-all">{txHash}</div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4 mr-2" />
          View
        </a>
      </Button>
    </div>
  );
}

function getBridgeSteps(transaction: BridgeTransaction): BridgeStep[] {
  const steps: BridgeStep[] = [
    {
      key: 'initiated',
      title: 'Transaction Initiated',
      description: 'Bridge transaction was created by the anchor or bridge service',
      status: transaction.status !== 'initiated' ? 'completed' : 'active',
      timestamp: transaction.timestamp,
      txHash: transaction.sourceTxHash,
      explorerUrl: transaction.sourceTxHash
        ? getExplorerUrl(transaction.sourceChain, transaction.sourceTxHash)
        : undefined,
    },
    {
      key: 'pending_anchor',
      title: 'Pending Anchor',
      description: 'Waiting for anchor or bridge processing',
      status: getStepStatus(transaction, 'pending_anchor'),
    },
    {
      key: 'on_chain',
      title: 'On Chain',
      description: 'Waiting for Stellar or external-network settlement',
      status: getStepStatus(transaction, 'on_chain'),
      txHash: transaction.targetTxHash,
      explorerUrl: transaction.targetTxHash
        ? getExplorerUrl(transaction.targetChain, transaction.targetTxHash)
        : undefined,
    },
    {
      key: 'completed',
      title: 'Completed',
      description: 'Bridge transaction completed successfully',
      status:
        transaction.status === 'completed'
          ? 'completed'
          : transaction.status === 'failed' || transaction.status === 'refunded'
            ? 'error'
            : 'pending',
    },
  ];

  if (transaction.status === 'failed' || transaction.status === 'refunded') {
    steps.push({
      key: 'error',
      title: transaction.status === 'refunded' ? 'Refunded' : 'Failed',
      description: transaction.errorMessage || 'Transaction did not complete successfully',
      status: 'error',
      txHash: transaction.refundTxHash,
      explorerUrl: transaction.refundTxHash
        ? getExplorerUrl(transaction.sourceChain, transaction.refundTxHash)
        : undefined,
    });
  }

  return steps;
}

function getStepStatus(transaction: BridgeTransaction, stepKey: BridgeStatus): BridgeStep['status'] {
  const statusOrder: Record<BridgeStatus, number> = {
    initiated: 0,
    pending_anchor: 1,
    on_chain: 2,
    completed: 3,
    failed: -1,
    refunded: -1,
  };

  if (transaction.status === 'failed' || transaction.status === 'refunded') {
    return 'error';
  }

  const currentStatusIndex = statusOrder[transaction.status];
  const stepIndex = statusOrder[stepKey];

  if (currentStatusIndex > stepIndex) return 'completed';
  if (currentStatusIndex === stepIndex) return 'active';
  return 'pending';
}

function getExplorerUrl(chain: string, txHash: string): string {
  const explorers: Record<string, string> = {
    Stellar: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    Ethereum: `https://sepolia.etherscan.io/tx/${txHash}`,
    Polygon: `https://mumbai.polygonscan.com/tx/${txHash}`,
    Arbitrum: `https://sepolia.arbiscan.io/tx/${txHash}`,
    Optimism: `https://sepolia-optimism.etherscan.io/tx/${txHash}`,
  };
  return explorers[chain] || '#';
}

function getStatusIcon(status: BridgeStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'on_chain':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    case 'pending_anchor':
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case 'initiated':
      return <Clock className="h-4 w-4 text-gray-600" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'refunded':
      return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    default:
      return <Clock className="h-4 w-4 text-gray-600" />;
  }
}

function getProgressPercentage(transaction: BridgeTransaction): number {
  const statusProgress: Record<BridgeStatus, number> = {
    initiated: 25,
    pending_anchor: 50,
    on_chain: 75,
    completed: 100,
    failed: 0,
    refunded: 0,
  };
  return statusProgress[transaction.status];
}
