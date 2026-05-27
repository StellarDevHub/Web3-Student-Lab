'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  Activity,
  ArrowRightLeft,
  Clock,
  Eye,
  EyeOff,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// D3 imports will be handled dynamically to avoid SSR issues
interface Node {
  id: string;
  name: string;
  type: 'account' | 'ledger' | 'transaction';
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  color: string;
  data?: {
    balance?: string;
    sequence?: number;
    hash?: string;
    amount?: string;
    timestamp?: Date;
  };
}

interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
  type: 'payment' | 'trustline' | 'offer';
  color: string;
  data?: {
    amount?: string;
    asset?: string;
    hash?: string;
  };
}

interface StreamData {
  ledgers: LedgerData[];
  transactions: TransactionData[];
  accounts: AccountData[];
}

interface LedgerData {
  sequence: number;
  hash: string;
  timestamp: Date;
  transactionCount: number;
  operationCount: number;
  baseFee: number;
  baseReserve: number;
}

interface TransactionData {
  hash: string;
  ledger: number;
  timestamp: Date;
  sourceAccount: string;
  operations: OperationData[];
  memo?: string;
}

interface OperationData {
  type: string;
  sourceAccount?: string;
  amount?: string;
  asset?: string;
  destination?: string;
}

interface AccountData {
  id: string;
  balance: string;
  sequence: number;
  lastActivity: Date;
}

export default function NetworkLedgerStreamer() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeWindow, setTimeWindow] = useState(5); // minutes
  const [showAccounts, setShowAccounts] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);
  const [showLedgers, setShowLedgers] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [streamData, setStreamData] = useState<StreamData>({
    ledgers: [],
    transactions: [],
    accounts: [],
  });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [stats, setStats] = useState({
    ledgersPerSecond: 0,
    transactionsPerSecond: 0,
    totalAccounts: 0,
    totalValue: 0,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<any>(null);
  const streamRef = useRef<EventSource | null>(null);

  // Initialize D3 visualization
  const initializeVisualization = useCallback(async () => {
    if (!svgRef.current) return;

    // Dynamically import D3 to avoid SSR issues
    const d3 = await import('d3');
    const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = d3;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear existing content
    svg.selectAll('*').remove();

    // Create simulation
    const simulation = forceSimulation<Node>()
      .force(
        'link',
        forceLink<Node, Link>()
          .id((d) => d.id)
          .distance(50)
      )
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'collision',
        forceCollide().radius((d: any) => d.radius + 5)
      );

    simulationRef.current = simulation;

    // Create container groups
    const container = svg.append('g');

    // Add zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Create link elements
    const link = container
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => Math.sqrt(d.value))
      .attr('opacity', 0.6);

    // Create node elements
    const node = container
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', dragstarted as any)
          .on('drag', dragged as any)
          .on('end', dragended as any) as any
      )
      .on('click', (event, d) => {
        setSelectedNode(d);
      });

    // Add labels for important nodes
    const label = container
      .append('g')
      .selectAll('text')
      .data(nodes.filter((d) => d.type === 'ledger' || d.type === 'account'))
      .enter()
      .append('text')
      .text((d) => d.name)
      .attr('font-size', '10px')
      .attr('dx', 15)
      .attr('dy', 4);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);

      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }, [nodes, links]);

  // Start streaming from Horizon
  const startStreaming = useCallback(() => {
    // In a real implementation, this would connect to Horizon Stream API
    // For demo purposes, we'll simulate the stream

    if (streamRef.current) {
      streamRef.current.close();
    }

    setIsStreaming(true);
    setIsPaused(false);

    // Simulate stream data
    const simulateStream = () => {
      if (!isPaused && isStreaming) {
        const newLedger: LedgerData = {
          sequence: Math.floor(Math.random() * 1000000),
          hash: `ledger_${Date.now()}`,
          timestamp: new Date(),
          transactionCount: Math.floor(Math.random() * 100),
          operationCount: Math.floor(Math.random() * 500),
          baseFee: 100,
          baseReserve: 5000000,
        };

        const newTransaction: TransactionData = {
          hash: `tx_${Date.now()}`,
          ledger: newLedger.sequence,
          timestamp: new Date(),
          sourceAccount: `G${Math.random().toString(16).substring(2, 58)}`,
          operations: [
            {
              type: 'payment',
              amount: (Math.random() * 1000).toFixed(7),
              asset: 'XLM',
              destination: `G${Math.random().toString(16).substring(2, 58)}`,
            },
          ],
        };

        const newAccount: AccountData = {
          id: `G${Math.random().toString(16).substring(2, 58)}`,
          balance: (Math.random() * 10000).toFixed(7),
          sequence: Math.floor(Math.random() * 1000),
          lastActivity: new Date(),
        };

        setStreamData((prev) => ({
          ledgers: [...prev.ledgers.slice(-50), newLedger],
          transactions: [...prev.transactions.slice(-100), newTransaction],
          accounts: [...prev.accounts.slice(-200), newAccount],
        }));

        // Update graph data
        updateGraphData(newTransaction, newAccount);
        updateStats();
      }
    };

    const interval = setInterval(simulateStream, 5000); // New data every 5 seconds
    streamRef.current = { close: () => clearInterval(interval) } as any;
  }, [isPaused, isStreaming]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setIsStreaming(false);
    setIsPaused(false);
  }, []);

  // Update graph visualization data
  const updateGraphData = (transaction: TransactionData, account: AccountData) => {
    const newNodes: Node[] = [];
    const newLinks: Link[] = [];

    // Add transaction node
    if (showTransactions) {
      newNodes.push({
        id: transaction.hash,
        name: `TX ${transaction.hash.substring(0, 8)}...`,
        type: 'transaction',
        radius: 8,
        color: '#3b82f6',
        data: {
          hash: transaction.hash,
          amount: transaction.operations[0]?.amount,
          timestamp: transaction.timestamp,
        },
      });
    }

    // Add account nodes
    if (showAccounts) {
      [transaction.sourceAccount, transaction.operations[0]?.destination].forEach((accountId) => {
        if (accountId) {
          newNodes.push({
            id: accountId,
            name: accountId.substring(0, 8) + '...',
            type: 'account',
            radius: 12,
            color: '#10b981',
            data: {
              balance: account.balance,
              sequence: account.sequence,
            },
          });
        }
      });
    }

    // Add ledger node
    if (showLedgers) {
      newNodes.push({
        id: `ledger_${transaction.ledger}`,
        name: `Ledger ${transaction.ledger}`,
        type: 'ledger',
        radius: 15,
        color: '#f59e0b',
        data: {
          sequence: transaction.ledger,
          hash: transaction.hash,
        },
      });
    }

    // Add links
    if (showTransactions && showAccounts) {
      newLinks.push({
        source: transaction.sourceAccount,
        target: transaction.hash,
        value: 2,
        type: 'payment',
        color: '#3b82f6',
      });

      if (transaction.operations[0]?.destination) {
        newLinks.push({
          source: transaction.hash,
          target: transaction.operations[0].destination,
          value: 2,
          type: 'payment',
          color: '#3b82f6',
        });
      }
    }

    setNodes((prev) => {
      const filtered = prev.filter(
        (n) => n.data?.timestamp && Date.now() - n.data.timestamp.getTime() < timeWindow * 60 * 1000
      );
      return [...filtered.slice(-100), ...newNodes];
    });

    setLinks((prev) => {
      const filtered = prev.filter(
        (l) => Date.now() - new Date().getTime() < timeWindow * 60 * 1000
      );
      return [...filtered.slice(-200), ...newLinks];
    });
  };

  // Update statistics
  const updateStats = () => {
    setStats({
      ledgersPerSecond: (Math.random() * 0.2).toFixed(3) as any,
      transactionsPerSecond: (Math.random() * 5).toFixed(3) as any,
      totalAccounts: streamData.accounts.length,
      totalValue: streamData.transactions.reduce(
        (sum, tx) => sum + parseFloat(tx.operations[0]?.amount || '0'),
        0
      ),
    });
  };

  // Initialize visualization when data changes
  useEffect(() => {
    if (nodes.length > 0 || links.length > 0) {
      initializeVisualization();
    }
  }, [nodes, links, initializeVisualization]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close();
      }
    };
  }, []);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stellar Network Ledger Streamer</h1>
          <p className="text-muted-foreground">
            Real-time visualization of Stellar network activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsPaused(!isPaused)} disabled={!isStreaming} variant="outline">
            {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            onClick={isStreaming ? stopStreaming : startStreaming}
            variant={isStreaming ? 'destructive' : 'default'}
          >
            {isStreaming ? (
              <RefreshCw className="h-4 w-4 mr-2" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Controls
            </CardTitle>
            <CardDescription>Configure the visualization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Time Window: {timeWindow} minutes</Label>
              <Slider
                value={timeWindow}
                onValueChange={(value) => setTimeWindow(value)}
                max={60}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-accounts">Show Accounts</Label>
                <Switch
                  id="show-accounts"
                  checked={showAccounts}
                  onCheckedChange={setShowAccounts}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-transactions">Show Transactions</Label>
                <Switch
                  id="show-transactions"
                  checked={showTransactions}
                  onCheckedChange={setShowTransactions}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-ledgers">Show Ledgers</Label>
                <Switch id="show-ledgers" checked={showLedgers} onCheckedChange={setShowLedgers} />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">Network Stats</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Ledgers/sec:</span>
                  <span className="font-mono">{stats.ledgersPerSecond}</span>
                </div>
                <div className="flex justify-between">
                  <span>TX/sec:</span>
                  <span className="font-mono">{stats.transactionsPerSecond}</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Accounts:</span>
                  <span className="font-mono">{stats.totalAccounts}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Value:</span>
                  <span className="font-mono">{stats.totalValue.toFixed(2)} XLM</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">Legend</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span>Ledgers</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Transactions</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Accounts</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visualization */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Network Graph
              </CardTitle>
              <CardDescription>Real-time network activity visualization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-96 border rounded-lg overflow-hidden">
                <svg ref={svgRef} width="100%" height="100%" className="bg-muted/20" />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <div className="text-center">
                      <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        Click "Start Streaming" to begin real-time visualization
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Details
            </CardTitle>
            <CardDescription>Click on nodes for details</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <Badge variant="secondary">{selectedNode.type}</Badge>
                  <h3 className="font-semibold mt-2">{selectedNode.name}</h3>
                </div>

                {selectedNode.data && (
                  <div className="space-y-2 text-sm">
                    {selectedNode.data.balance && (
                      <div>
                        <span className="font-medium">Balance:</span>
                        <span className="ml-2 font-mono">{selectedNode.data.balance} XLM</span>
                      </div>
                    )}
                    {selectedNode.data.sequence && (
                      <div>
                        <span className="font-medium">Sequence:</span>
                        <span className="ml-2 font-mono">{selectedNode.data.sequence}</span>
                      </div>
                    )}
                    {selectedNode.data.amount && (
                      <div>
                        <span className="font-medium">Amount:</span>
                        <span className="ml-2 font-mono">{selectedNode.data.amount} XLM</span>
                      </div>
                    )}
                    {selectedNode.data.timestamp && (
                      <div>
                        <span className="font-medium">Time:</span>
                        <span className="ml-2">
                          {selectedNode.data.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                    {selectedNode.data.hash && (
                      <div>
                        <span className="font-medium">Hash:</span>
                        <span className="ml-2 font-mono text-xs break-all">
                          {selectedNode.data.hash}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <EyeOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Select a node to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest network events</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="transactions" className="w-full">
            <TabsList>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="ledgers">Ledgers</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
            </TabsList>

            <TabsContent value="transactions">
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {streamData.transactions
                    .slice(-10)
                    .reverse()
                    .map((tx, index) => (
                      <div
                        key={tx.hash}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                          <div>
                            <div className="font-mono text-sm">{tx.hash.substring(0, 12)}...</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.operations[0]?.amount} XLM
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {tx.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ledgers">
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {streamData.ledgers
                    .slice(-10)
                    .reverse()
                    .map((ledger, index) => (
                      <div
                        key={ledger.hash}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-amber-500" />
                          <div>
                            <div className="font-semibold">Ledger {ledger.sequence}</div>
                            <div className="text-xs text-muted-foreground">
                              {ledger.transactionCount} txs, {ledger.operationCount} ops
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ledger.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="accounts">
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {streamData.accounts
                    .slice(-10)
                    .reverse()
                    .map((account, index) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-green-500" />
                          <div>
                            <div className="font-mono text-sm">
                              {account.id.substring(0, 12)}...
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {account.balance} XLM
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {account.lastActivity.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
