'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import {
  ArrowRightLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  HelpCircle,
  Loader2,
} from 'lucide-react';

type BridgeStatus =
  | 'initiated'
  | 'pending_anchor'
  | 'on_chain'
  | 'completed'
  | 'failed'
  | 'refunded';

interface BridgeTransaction {
  id: string;
  sourceChain: string;
  targetChain: string;
  amount: string;
  asset: string;
  sender: string;
  recipient: string;
  status: BridgeStatus;
  timestamp: Date;
  sourceTxHash?: string;
  targetTxHash?: string;
  anchorId?: string;
  errorMessage?: string;
  refundTxHash?: string;
  estimatedCompletion?: Date;
}

interface BridgeStep {
  key: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp?: Date;
  txHash?: string;
  explorerUrl?: string;
}

const MOCK_TRANSACTIONS: BridgeTransaction[] = [
  {
    id: 'bridge_001',
    sourceChain: 'Stellar',
    targetChain: 'Ethereum',
    amount: '100.00',
    asset: 'USDC',
    sender: 'GBX...123',
    recipient: '0x742d...892',
    status: 'completed',
    timestamp: new Date(Date.now() - 3600000),
    sourceTxHash: 'stellar_tx_hash_001',
    targetTxHash: '0xabcdef123456789',
    estimatedCompletion: new Date(Date.now() - 1800000),
  },
  {
    id: 'bridge_002',
    sourceChain: 'Ethereum',
    targetChain: 'Stellar',
    amount: '0.5',
    asset: 'ETH',
    sender: '0x1234...5678',
    recipient: 'GDX...456',
    status: 'on_chain',
    timestamp: new Date(Date.now() - 1800000),
    sourceTxHash: '0x123456789abcdef',
    estimatedCompletion: new Date(Date.now() + 900000),
  },
  {
    id: 'bridge_003',
    sourceChain: 'Stellar',
    targetChain: 'Polygon',
    amount: '250.00',
    asset: 'USDC',
    sender: 'GAX...789',
    recipient: '0x9876...5432',
    status: 'pending_anchor',
    timestamp: new Date(Date.now() - 600000),
    sourceTxHash: 'stellar_tx_hash_003',
    estimatedCompletion: new Date(Date.now() + 2400000),
  },
  {
    id: 'bridge_004',
    sourceChain: 'Stellar',
    targetChain: 'Ethereum',
    amount: '50.00',
    asset: 'USDC',
    sender: 'GTX...321',
    recipient: '0x5555...6666',
    status: 'failed',
    timestamp: new Date(Date.now() - 7200000),
    sourceTxHash: 'stellar_tx_hash_004',
    errorMessage: 'Anchor timeout - no response received',
    refundTxHash: 'stellar_refund_hash_004',
  },
];

export default function BridgeTransactionTracker() {
  const [transactions, setTransactions] = useState<BridgeTransaction[]>(MOCK_TRANSACTIONS);
  const [selectedTransaction, setSelectedTransaction] = useState<BridgeTransaction | null>(null);
  const [searchId, setSearchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(async () => {
      await refreshTransactions();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const refreshTransactions = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API calls to bridge service
      // This would poll SEP-24/SEP-6 endpoints for status updates

      // Simulate API call with random status changes
      setTransactions((prev) =>
        prev.map((tx) => {
          if (tx.status === 'pending_anchor' && Math.random() > 0.7) {
            return { ...tx, status: 'on_chain' as BridgeStatus };
          }
          if (tx.status === 'on_chain' && Math.random() > 0.8) {
            return {
              ...tx,
              status: 'completed' as BridgeStatus,
              targetTxHash: '0x' + Math.random().toString(16).substring(2, 66),
            };
          }
          return tx;
        })
      );
    } catch (error) {
      console.error('Error refreshing transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBridgeSteps = (transaction: BridgeTransaction): BridgeStep[] => {
    const steps: BridgeStep[] = [
      {
        key: 'initiated',
        title: 'Transaction Initiated',
        description: 'Bridge transaction started on source chain',
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
        description: 'Waiting for anchor to process the transfer',
        status: getStepStatus(transaction, 'pending_anchor'),
        timestamp: transaction.status === 'pending_anchor' ? new Date() : undefined,
      },
      {
        key: 'on_chain',
        title: 'On Target Chain',
        description: 'Transaction submitted to target chain',
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

    // Add error step if failed
    if (transaction.status === 'failed' || transaction.status === 'refunded') {
      steps.push({
        key: 'error',
        title: transaction.status === 'refunded' ? 'Refunded' : 'Failed',
        description: transaction.errorMessage || 'Transaction failed',
        status: 'error',
        txHash: transaction.refundTxHash,
        explorerUrl: transaction.refundTxHash
          ? getExplorerUrl(transaction.sourceChain, transaction.refundTxHash)
          : undefined,
      });
    }

    return steps;
  };

  const getStepStatus = (transaction: BridgeTransaction, stepKey: string): BridgeStep['status'] => {
    const statusOrder: Record<BridgeStatus, number> = {
      initiated: 0,
      pending_anchor: 1,
      on_chain: 2,
      completed: 3,
      failed: -1,
      refunded: -1,
    };

    const currentStatusIndex = statusOrder[transaction.status];
    const stepIndex = statusOrder[stepKey as BridgeStatus] || 0;

    if (transaction.status === 'failed' || transaction.status === 'refunded') {
      return 'error';
    }

    if (currentStatusIndex > stepIndex) {
      return 'completed';
    } else if (currentStatusIndex === stepIndex) {
      return 'active';
    } else {
      return 'pending';
    }
  };

  const getExplorerUrl = (chain: string, txHash: string): string => {
    const explorers: Record<string, string> = {
      Stellar: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
      Ethereum: `https://sepolia.etherscan.io/tx/${txHash}`,
      Polygon: `https://mumbai.polygonscan.com/tx/${txHash}`,
      Arbitrum: `https://sepolia.arbiscan.io/tx/${txHash}`,
      Optimism: `https://sepolia-optimism.etherscan.io/tx/${txHash}`,
    };
    return explorers[chain] || '#';
  };

  const getStatusColor = (status: BridgeStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'on_chain':
        return 'bg-blue-500';
      case 'pending_anchor':
        return 'bg-yellow-500';
      case 'initiated':
        return 'bg-gray-500';
      case 'failed':
        return 'bg-red-500';
      case 'refunded':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: BridgeStatus) => {
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
  };

  const getProgressPercentage = (transaction: BridgeTransaction): number => {
    const statusProgress: Record<BridgeStatus, number> = {
      initiated: 25,
      pending_anchor: 50,
      on_chain: 75,
      completed: 100,
      failed: 0,
      refunded: 0,
    };
    return statusProgress[transaction.status];
  };

  const filteredTransactions = transactions.filter(
    (tx) =>
      tx.id.toLowerCase().includes(searchId.toLowerCase()) ||
      tx.sender.toLowerCase().includes(searchId.toLowerCase()) ||
      tx.recipient.toLowerCase().includes(searchId.toLowerCase())
  );

  const selectedSteps = selectedTransaction ? getBridgeSteps(selectedTransaction) : [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cross-Chain Bridge Tracker</h1>
          <p className="text-muted-foreground">
            Monitor the status of your cross-chain bridge transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refreshing' : 'Auto-refresh'}
          </Button>
          <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bridge Transaction Help</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Learn how to track your cross-chain bridge transactions
                </p>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold">Transaction Statuses</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>
                      • <strong>Initiated:</strong> Transaction started on source chain
                    </li>
                    <li>
                      • <strong>Pending Anchor:</strong> Waiting for anchor processing
                    </li>
                    <li>
                      • <strong>On Chain:</strong> Submitted to target chain
                    </li>
                    <li>
                      • <strong>Completed:</strong> Successfully bridged
                    </li>
                    <li>
                      • <strong>Failed:</strong> Transaction failed
                    </li>
                    <li>
                      • <strong>Refunded:</strong> Funds were refunded
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold">Explorer Links</h4>
                  <p className="text-sm text-muted-foreground">
                    Click on transaction hashes to view them on the respective blockchain explorers.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">Estimated Completion</h4>
                  <p className="text-sm text-muted-foreground">
                    Completion times are estimates based on network conditions and may vary.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction List */}
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
                onChange={(e) => setSearchId(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredTransactions.map((transaction) => (
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
                      {transaction.sourceChain} → {transaction.targetChain}
                    </div>
                    <div>{transaction.timestamp.toLocaleTimeString()}</div>
                  </div>
                  <div className="mt-2">
                    <Progress value={getProgressPercentage(transaction)} className="h-1" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details */}
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
                            {step.txHash && (
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
                          Estimated completion:{' '}
                          {selectedTransaction.estimatedCompletion.toLocaleString()}
                        </AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Transaction ID</Label>
                        <p className="font-mono text-sm">{selectedTransaction.id}</p>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(selectedTransaction.status)}
                          <span className="capitalize">
                            {selectedTransaction.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div>
                        <Label>Amount</Label>
                        <p className="font-semibold">
                          {selectedTransaction.amount} {selectedTransaction.asset}
                        </p>
                      </div>
                      <div>
                        <Label>Started</Label>
                        <p>{selectedTransaction.timestamp.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label>Source Chain</Label>
                        <p>{selectedTransaction.sourceChain}</p>
                      </div>
                      <div>
                        <Label>Target Chain</Label>
                        <p>{selectedTransaction.targetChain}</p>
                      </div>
                      <div>
                        <Label>Sender</Label>
                        <p className="font-mono text-sm">{selectedTransaction.sender}</p>
                      </div>
                      <div>
                        <Label>Recipient</Label>
                        <p className="font-mono text-sm">{selectedTransaction.recipient}</p>
                      </div>
                    </div>

                    {selectedTransaction.errorMessage && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{selectedTransaction.errorMessage}</AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>

                  <TabsContent value="explorers" className="space-y-4">
                    <div className="space-y-3">
                      {selectedTransaction.sourceTxHash && (
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-semibold">Source Transaction</div>
                            <div className="text-sm text-muted-foreground">
                              {selectedTransaction.sourceChain}
                            </div>
                            <div className="font-mono text-xs mt-1">
                              {selectedTransaction.sourceTxHash}
                            </div>
                          </div>
                          {selectedTransaction.sourceTxHash && selectedTransaction.sourceChain && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = getExplorerUrl(
                                  selectedTransaction.sourceChain,
                                  selectedTransaction.sourceTxHash ?? ''
                                );
                                if (url) window.open(url, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          )}
                        </div>
                      )}

                      {selectedTransaction.targetTxHash && selectedTransaction.targetChain && (
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-semibold">Target Transaction</div>
                            <div className="text-sm text-muted-foreground">
                              {selectedTransaction.targetChain}
                            </div>
                            <div className="font-mono text-xs mt-1">
                              {selectedTransaction.targetTxHash}
                            </div>
                          </div>
                          {selectedTransaction.targetTxHash && selectedTransaction.targetChain && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = getExplorerUrl(
                                  selectedTransaction.targetChain,
                                  selectedTransaction.targetTxHash ?? ''
                                );
                                if (url) window.open(url, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          )}
                        </div>
                      )}

                      {selectedTransaction.refundTxHash && selectedTransaction.sourceChain && (
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-semibold">Refund Transaction</div>
                            <div className="text-sm text-muted-foreground">
                              {selectedTransaction.sourceChain}
                            </div>
                            <div className="font-mono text-xs mt-1">
                              {selectedTransaction.refundTxHash}
                            </div>
                          </div>
                          {selectedTransaction.refundTxHash && selectedTransaction.sourceChain && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = getExplorerUrl(
                                  selectedTransaction.sourceChain,
                                  selectedTransaction.refundTxHash ?? ''
                                );
                                if (url) window.open(url, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
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
