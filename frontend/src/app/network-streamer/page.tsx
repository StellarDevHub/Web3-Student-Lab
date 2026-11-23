'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  Filter,
  Layers,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Terminal,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DecodedContractEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  type: 'contract' | 'system' | 'diagnostic';
  topicsRaw: string[];
  topicsDecoded: any[];
  valueRaw: string;
  valueDecoded: any;
  txHash: string;
  pagingToken: string;
  timestamp: number;
}

// D3 Node & Link Interfaces for Topology View
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

// ─── XDR Decoding Helpers ──────────────────────────────────────────────────────

export function safeDecodeScVal(base64Xdr: string): any {
  if (!base64Xdr) return null;
  try {
    const val = xdr.ScVal.fromXDR(base64Xdr, 'base64');
    return scValToNative(val);
  } catch {
    // Fallback: return raw string if not valid ScVal XDR
    return base64Xdr;
  }
}

export function formatValueForDisplay(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

// ─── Pre-built XDR Samples for realistic event simulation ──────────────────────
const SAMPLE_CONTRACTS = [
  'CCW67TSBXDVU26TWKC5NJW7PCH3S8P74S77XJ37T32G2281S34K',
  'CDLZFC3SYJYDVR72W2MBLGDDP23T7B4K69A57T33Z44S21K89L',
  'CA3DK3Z4K28K99LP11M49A887V92Z23X11C88P99Q33W22B11N',
  'CB77N11K33V99X22C88P99Q33W22B11M49A887V92Z23X11C88',
];

// Pre-encoded Base64 ScVals for common Soroban event symbols & topics
const SAMPLE_EVENT_TEMPLATES = [
  {
    topicName: 'transfer',
    topicXdr: 'AAAADAAAAAh0cmFuc2Zlcg==',
    type: 'contract' as const,
    generateValue: () => {
      const from = `G${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      const to = `G${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      const amount = (Math.random() * 5000 + 10).toFixed(2);
      return {
        valueDecoded: { amount: `${amount} STLR`, from, to },
        valueRaw: 'AAAAEAAAAAKAAAAAA...',
      };
    },
  },
  {
    topicName: 'swap',
    topicXdr: 'AAAADAAAAARzd2Fw',
    type: 'contract' as const,
    generateValue: () => {
      const amountIn = (Math.random() * 1000 + 50).toFixed(2);
      const amountOut = (parseFloat(amountIn) * 1.05).toFixed(2);
      return {
        valueDecoded: {
          assetIn: 'XLM',
          assetOut: 'USDC',
          amountIn: `${amountIn} XLM`,
          amountOut: `${amountOut} USDC`,
          slippage: '0.1%',
        },
        valueRaw: 'AAAAEAAAAAKAAAAAA...',
      };
    },
  },
  {
    topicName: 'mint',
    topicXdr: 'AAAADAAAAARtaW50',
    type: 'contract' as const,
    generateValue: () => {
      const recipient = `G${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      const amount = (Math.random() * 10000).toFixed(0);
      return {
        valueDecoded: { recipient, mintedAmount: `${amount} TOKEN` },
        valueRaw: 'AAAAEAAAAAKAAAAAA...',
      };
    },
  },
  {
    topicName: 'deposit',
    topicXdr: 'AAAADAAAAAdkZXBvc2l0',
    type: 'system' as const,
    generateValue: () => {
      const account = `G${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      return {
        valueDecoded: { account, vaultId: 'VAULT_01', liquidity: '500.00' },
        valueRaw: 'AAAAEAAAAAKAAAAAA...',
      };
    },
  },
  {
    topicName: 'governance_vote',
    topicXdr: 'AAAADAAAAA9nb3Zlcm5hbmNlX3ZvdGU=',
    type: 'contract' as const,
    generateValue: () => {
      const voter = `G${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      return {
        valueDecoded: { voter, proposalId: 42, vote: 'FOR', weight: 15000 },
        valueRaw: 'AAAAEAAAAAKAAAAAA...',
      };
    },
  },
];

export default function NetworkLedgerStreamer() {
  // ─── Mode & Navigation State ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'events' | 'topology'>('events');

  // ─── Event Streamer State (FE-HARD-21) ──────────────────────────────────────
  const [isEventStreaming, setIsEventStreaming] = useState(false);
  const [isEventPaused, setIsEventPaused] = useState(false);
  const [wsUrl, setWsUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'simulating' | 'error'
  >('disconnected');

  // Stream Performance Controls
  const [emitSpeed, setEmitSpeed] = useState<number>(5); // events/sec in simulation
  const [bufferLimit, setBufferLimit] = useState<number>(500);

  // Raw Captured Events Buffer & Filtered Events
  const [events, setEvents] = useState<DecodedContractEvent[]>([]);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [throughput, setThroughput] = useState<number>(0);
  const recentEventsCounterRef = useRef<number>(0);

  // Filters
  const [contractSearch, setContractSearch] = useState('');
  const [topicRegex, setTopicRegex] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'contract' | 'system' | 'diagnostic'>(
    'all'
  );
  const [regexError, setRegexError] = useState<string | null>(null);

  // Selected Event Detail Modal / Drawer
  const [selectedEvent, setSelectedEvent] = useState<DecodedContractEvent | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // WebSockets & Simulation Refs
  const eventWsRef = useRef<WebSocket | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Legacy D3 Topology View State ──────────────────────────────────────────
  const [timeWindow, setTimeWindow] = useState(5);
  const [showAccounts, setShowAccounts] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);
  const [showLedgers, setShowLedgers] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<any>(null);

  // ─── Event Regex Filter Validation & Filtering ──────────────────────────────
  const activeRegex = useMemo(() => {
    if (!topicRegex.trim()) {
      setRegexError(null);
      return null;
    }
    try {
      const reg = new RegExp(topicRegex.trim(), 'i');
      setRegexError(null);
      return reg;
    } catch (err: any) {
      setRegexError(err.message || 'Invalid regular expression');
      return null;
    }
  }, [topicRegex]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Contract ID filter
      if (
        contractSearch.trim() &&
        !ev.contractId.toLowerCase().includes(contractSearch.trim().toLowerCase())
      ) {
        return false;
      }
      // Type filter
      if (typeFilter !== 'all' && ev.type !== typeFilter) {
        return false;
      }
      // Topic Regex filter
      if (activeRegex) {
        const topicsString = ev.topicsDecoded.map((t) => formatValueForDisplay(t)).join(' ');
        const rawString = ev.topicsRaw.join(' ');
        const matchesDecoded = activeRegex.test(topicsString);
        const matchesRaw = activeRegex.test(rawString);
        if (!matchesDecoded && !matchesRaw) {
          return false;
        }
      }
      return true;
    });
  }, [events, contractSearch, typeFilter, activeRegex]);

  // ─── Throughput Metrics Calculation ────────────────────────────────────────
  useEffect(() => {
    statsIntervalRef.current = setInterval(() => {
      setThroughput(recentEventsCounterRef.current);
      recentEventsCounterRef.current = 0;
    }, 1000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, []);

  // ─── High-Throughput Event Simulator Engine ─────────────────────────────────
  const generateSimulatedEvent = useCallback((): DecodedContractEvent => {
    const template =
      SAMPLE_EVENT_TEMPLATES[Math.floor(Math.random() * SAMPLE_EVENT_TEMPLATES.length)];
    const contractId = SAMPLE_CONTRACTS[Math.floor(Math.random() * SAMPLE_CONTRACTS.length)];
    const ledger = Math.floor(6500000 + Math.random() * 50000);
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txHash = `${Math.random().toString(16).substring(2, 34)}${Math.random().toString(16).substring(2, 34)}`;

    const { valueDecoded, valueRaw } = template.generateValue();

    // Secondary topics (e.g. transfer sender account)
    const secondaryTopic = `G${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    return {
      id,
      ledger,
      ledgerClosedAt: new Date().toISOString(),
      contractId,
      type: template.type,
      topicsRaw: [template.topicXdr, 'AAAADAAAAAhTRUONTkRFUg=='],
      topicsDecoded: [template.topicName, secondaryTopic],
      valueRaw,
      valueDecoded,
      txHash,
      pagingToken: `${ledger}-${Date.now()}`,
      timestamp: Date.now(),
    };
  }, []);

  const pushNewEvent = useCallback(
    (newEvent: DecodedContractEvent) => {
      if (isEventPaused) return;

      recentEventsCounterRef.current += 1;
      setProcessedCount((prev) => prev + 1);

      setEvents((prev) => {
        const updated = [newEvent, ...prev];
        if (updated.length > bufferLimit) {
          return updated.slice(0, bufferLimit);
        }
        return updated;
      });
    },
    [isEventPaused, bufferLimit]
  );

  // Start / Stop Event Streaming
  const startEventStreaming = useCallback(() => {
    setIsEventStreaming(true);
    setIsEventPaused(false);

    // If a custom WebSocket URL is provided, connect to it
    if (wsUrl.trim().startsWith('ws://') || wsUrl.trim().startsWith('wss://')) {
      setConnectionStatus('connecting');
      try {
        const ws = new WebSocket(wsUrl.trim());
        eventWsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('connected');
        };

        ws.onmessage = (msg) => {
          try {
            const rawData = JSON.parse(msg.data);
            const rawTopic = rawData.topic || rawData.topics || [];
            const decodedTopics = Array.isArray(rawTopic)
              ? rawTopic.map((t: string) => safeDecodeScVal(t))
              : [];
            const decodedValue = rawData.value ? safeDecodeScVal(rawData.value) : rawData.data;

            const parsedEvent: DecodedContractEvent = {
              id: rawData.id || `ws_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              ledger: rawData.ledger || Math.floor(Date.now() / 1000),
              ledgerClosedAt: rawData.ledgerClosedAt || new Date().toISOString(),
              contractId: rawData.contractId || rawData.contract || 'UNKNOWN_CONTRACT',
              type: rawData.type || 'contract',
              topicsRaw: Array.isArray(rawTopic) ? rawTopic : [],
              topicsDecoded: decodedTopics,
              valueRaw: rawData.value || '',
              valueDecoded: decodedValue,
              txHash: rawData.txHash || rawData.hash || '',
              pagingToken: rawData.pagingToken || String(Date.now()),
              timestamp: Date.now(),
            };

            pushNewEvent(parsedEvent);
          } catch {
            // Ignore malformed WS frames
          }
        };

        ws.onerror = () => {
          setConnectionStatus('error');
        };

        ws.onclose = () => {
          setConnectionStatus('disconnected');
          setIsEventStreaming(false);
        };
      } catch {
        setConnectionStatus('error');
      }
    } else {
      // Fallback: Run High-Throughput Event Simulator
      setConnectionStatus('simulating');
      const intervalMs = Math.max(10, Math.floor(1000 / emitSpeed));

      simIntervalRef.current = setInterval(() => {
        pushNewEvent(generateSimulatedEvent());
      }, intervalMs);
    }
  }, [wsUrl, emitSpeed, pushNewEvent, generateSimulatedEvent]);

  const stopEventStreaming = useCallback(() => {
    if (eventWsRef.current) {
      eventWsRef.current.close();
      eventWsRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsEventStreaming(false);
    setIsEventPaused(false);
    setConnectionStatus('disconnected');
  }, []);

  // Update simulator speed dynamically
  useEffect(() => {
    if (isEventStreaming && connectionStatus === 'simulating') {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      const intervalMs = Math.max(10, Math.floor(1000 / emitSpeed));
      simIntervalRef.current = setInterval(() => {
        pushNewEvent(generateSimulatedEvent());
      }, intervalMs);
    }
  }, [emitSpeed, isEventStreaming, connectionStatus, pushNewEvent, generateSimulatedEvent]);

  // Clean up streaming intervals on unmount
  useEffect(() => {
    return () => {
      if (eventWsRef.current) eventWsRef.current.close();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // ─── Export Handlers (CSV & JSON) ───────────────────────────────────────────
  const exportAsJSON = () => {
    const dataStr = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `soroban-events-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    const headers = [
      'ID',
      'Timestamp',
      'Ledger',
      'ContractID',
      'Type',
      'TopicsDecoded',
      'ValueDecoded',
      'TxHash',
    ];
    const rows = filteredEvents.map((ev) => [
      ev.id,
      new Date(ev.timestamp).toISOString(),
      ev.ledger,
      ev.contractId,
      ev.type,
      `"${ev.topicsDecoded.map((t) => formatValueForDisplay(t)).join(' | ')}"`,
      `"${formatValueForDisplay(ev.valueDecoded).replace(/"/g, '""')}"`,
      ev.txHash,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `soroban-events-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Legacy D3 Visualizer Logic ──────────────────────────────────────────────
  const initializeVisualization = useCallback(async () => {
    if (!svgRef.current) return;

    const d3 = await import('d3');
    const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = d3;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

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
    const container = svg.append('g');

    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    const link = container
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => Math.sqrt(d.value))
      .attr('opacity', 0.6);

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
      .on('click', (event, d) => {
        setSelectedNode(d);
      });

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

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
    });
  }, [nodes, links]);

  useEffect(() => {
    if (activeTab === 'topology' && (nodes.length > 0 || links.length > 0)) {
      initializeVisualization();
    }
  }, [nodes, links, initializeVisualization, activeTab]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Stellar Event Streaming Console</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              FE-HARD-21
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            High-throughput Soroban smart contract event subscriber with multi-topic regex filtering
            & XDR decoding
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as any)}
            className="w-[340px]"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="events" className="flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Contract Events
              </TabsTrigger>
              <TabsTrigger value="topology" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Topology Graph
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'events' ? (
        <div className="space-y-6">
          {/* Top Control Bar & Live Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Radio className="h-5 w-5 text-blue-500 animate-pulse" />
                      Stream Connection
                    </CardTitle>

                    {/* Status Badges */}
                    {connectionStatus === 'connected' && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        WebSocket Live
                      </Badge>
                    )}
                    {connectionStatus === 'simulating' && (
                      <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5" />
                        High-Throughput Sim Mode
                      </Badge>
                    )}
                    {connectionStatus === 'connecting' && (
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Connecting...
                      </Badge>
                    )}
                    {connectionStatus === 'disconnected' && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Disconnected
                      </Badge>
                    )}
                    {connectionStatus === 'error' && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Connection Error
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isEventStreaming && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEventPaused(!isEventPaused)}
                      >
                        {isEventPaused ? (
                          <>
                            <Play className="h-4 w-4 mr-1.5" /> Resume
                          </>
                        ) : (
                          <>
                            <Pause className="h-4 w-4 mr-1.5" /> Pause Feed
                          </>
                        )}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant={isEventStreaming ? 'destructive' : 'default'}
                      onClick={isEventStreaming ? stopEventStreaming : startEventStreaming}
                    >
                      {isEventStreaming ? (
                        <>
                          <Pause className="h-4 w-4 mr-1.5" /> Stop Stream
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1.5" /> Start Stream
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEvents([])}
                      disabled={events.length === 0}
                      title="Clear Event Log Buffer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="h-4 w-px bg-border mx-1" />

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={exportAsCSV}
                      disabled={filteredEvents.length === 0}
                      className="flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      CSV
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={exportAsJSON}
                      disabled={filteredEvents.length === 0}
                      className="flex items-center gap-1.5"
                    >
                      <FileJson className="h-4 w-4 text-blue-600" />
                      JSON
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom WebSocket Indexer Endpoint</Label>
                    <Input
                      placeholder="ws://localhost:8080/events (leave empty for simulation)"
                      value={wsUrl}
                      onChange={(e) => setWsUrl(e.target.value)}
                      disabled={isEventStreaming}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <Label className="text-xs">Simulator Emit Rate</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {emitSpeed} events/sec
                      </span>
                    </div>
                    <Slider
                      value={[emitSpeed]}
                      onValueChange={([val]) => setEmitSpeed(val)}
                      min={1}
                      max={50}
                      step={1}
                      disabled={connectionStatus === 'connected'}
                      className="py-1"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <Label className="text-xs">Memory Log Buffer Capacity</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {bufferLimit} max logs
                      </span>
                    </div>
                    <Select
                      value={String(bufferLimit)}
                      onValueChange={(val) => setBufferLimit(Number(val))}
                    >
                      <option value="100">100 logs</option>
                      <option value="500">500 logs</option>
                      <option value="1000">1,000 logs</option>
                      <option value="2500">2,500 logs</option>
                      <option value="5000">5,000 logs</option>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Performance Stat Counter Card */}
            <Card className="flex flex-col justify-between bg-muted/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between text-muted-foreground">
                  <span>Stream Metrics</span>
                  <Activity className="h-4 w-4 text-blue-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Current Rate:</span>
                  <span className="text-2xl font-bold font-mono text-emerald-600">
                    {throughput}{' '}
                    <span className="text-xs font-normal text-muted-foreground">ev/s</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t pt-2">
                  <span className="text-muted-foreground">Total Captured:</span>
                  <span className="font-mono font-semibold">{processedCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Filtered Matches:</span>
                  <span className="font-mono font-semibold text-blue-600">
                    {filteredEvents.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filtering & Search Bar Toolbar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Search & Multi-Topic Regex Filter Toolbar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search by Contract ID */}
                <div className="space-y-1.5">
                  <Label htmlFor="search-contract" className="text-xs flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    Contract ID Filter
                  </Label>
                  <div className="relative">
                    <Input
                      id="search-contract"
                      placeholder="e.g. CCW67TSB... or C..."
                      value={contractSearch}
                      onChange={(e) => setContractSearch(e.target.value)}
                      className="font-mono text-xs pr-8"
                    />
                    {contractSearch && (
                      <button
                        onClick={() => setContractSearch('')}
                        className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Topic Regex Filter */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-topic" className="text-xs flex items-center gap-1.5">
                      <Code className="h-3.5 w-3.5 text-muted-foreground" />
                      Topic Regex Filter
                    </Label>
                    {regexError ? (
                      <span className="text-[10px] text-destructive font-mono flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Invalid Regex
                      </span>
                    ) : topicRegex ? (
                      <span className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
                        <Check className="h-3 w-3" /> Pattern Active
                      </span>
                    ) : null}
                  </div>
                  <Input
                    id="search-topic"
                    placeholder="e.g. transfer|swap, ^mint, deposit.*"
                    value={topicRegex}
                    onChange={(e) => setTopicRegex(e.target.value)}
                    className={`font-mono text-xs ${regexError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                </div>

                {/* Event Type Filter */}
                <div className="space-y-1.5">
                  <Label htmlFor="type-filter" className="text-xs flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    Event Type
                  </Label>
                  <Select
                    value={typeFilter}
                    onValueChange={(val) => setTypeFilter(val as any)}
                    className="text-xs"
                  >
                    <option value="all">All Event Types</option>
                    <option value="contract">contract (Smart Contract)</option>
                    <option value="system">system (System Events)</option>
                    <option value="diagnostic">diagnostic (Debugging)</option>
                  </Select>
                </div>
              </div>

              {/* Preset Regex Tags */}
              <div className="flex items-center gap-2 pt-1 overflow-x-auto text-xs">
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  Quick Filters:
                </span>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setTopicRegex('transfer')}
                >
                  transfer
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setTopicRegex('swap|deposit')}
                >
                  swap|deposit
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setTopicRegex('mint')}
                >
                  mint
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setTopicRegex('governance.*')}
                >
                  governance.*
                </Badge>
                {topicRegex && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[11px]"
                    onClick={() => setTopicRegex('')}
                  >
                    Clear Filter
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Event Table */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Streaming Contract Event Logs
                </CardTitle>
                <CardDescription className="text-xs">
                  Showing {filteredEvents.length} of {events.length} captured events in memory
                </CardDescription>
              </div>

              {isEventPaused && (
                <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50">
                  Feed Paused
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] w-full border rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b text-muted-foreground font-medium uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Time / Ledger</th>
                      <th className="p-3">Contract ID</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Decoded Topics</th>
                      <th className="p-3">Decoded Value</th>
                      <th className="p-3">Tx Hash</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground">
                          <Radio className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50 animate-pulse" />
                          <p className="font-medium">No contract events matching current filters</p>
                          <p className="text-xs mt-1">
                            {!isEventStreaming
                              ? 'Click "Start Stream" above to begin streaming events'
                              : 'Try relaxing your Contract ID or Topic Regex search pattern'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-muted/40 transition-colors">
                          <td className="p-3 font-mono whitespace-nowrap">
                            <div>{new Date(ev.timestamp).toLocaleTimeString()}</div>
                            <div className="text-[10px] text-muted-foreground">L#{ev.ledger}</div>
                          </td>

                          <td className="p-3 font-mono">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {ev.contractId.substring(0, 8)}...
                              {ev.contractId.substring(ev.contractId.length - 4)}
                            </span>
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <Badge
                              variant={
                                ev.type === 'contract'
                                  ? 'default'
                                  : ev.type === 'system'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-[10px]"
                            >
                              {ev.type}
                            </Badge>
                          </td>

                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {ev.topicsDecoded.map((topic, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="font-mono text-[10px] bg-muted"
                                >
                                  {formatValueForDisplay(topic)}
                                </Badge>
                              ))}
                            </div>
                          </td>

                          <td className="p-3 max-w-xs truncate font-mono text-[11px] text-muted-foreground">
                            {formatValueForDisplay(ev.valueDecoded)}
                          </td>

                          <td className="p-3 font-mono text-[11px] text-muted-foreground">
                            {ev.txHash ? `${ev.txHash.substring(0, 8)}...` : '—'}
                          </td>

                          <td className="p-3 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedEvent(ev)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Inspect
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Legacy D3 Topology View Tab */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Topology Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Time Window: {timeWindow} minutes</Label>
                <Slider
                  value={[timeWindow]}
                  onValueChange={([val]) => setTimeWindow(val)}
                  max={60}
                  min={1}
                  step={1}
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
            </CardContent>
          </Card>

          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Interactive D3 Topology Graph
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative w-full h-[450px] border rounded-lg overflow-hidden bg-muted/20">
                  <svg ref={svgRef} width="100%" height="100%" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Selected Event Details Modal Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2 font-mono">
                  Event XDR Inspector
                </CardTitle>
                <CardDescription className="text-xs font-mono">
                  ID: {selectedEvent.id}
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)}>
                ×
              </Button>
            </CardHeader>

            <CardContent className="overflow-y-auto space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Contract ID:</span>
                  <p className="font-semibold break-all text-blue-600">
                    {selectedEvent.contractId}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ledger Sequence:</span>
                  <p className="font-semibold">#{selectedEvent.ledger}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Event Type:</span>
                  <p className="font-semibold uppercase">{selectedEvent.type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Transaction Hash:</span>
                  <p className="font-semibold break-all">{selectedEvent.txHash || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Decoded Topics Array</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-xs overflow-x-auto">
                  <pre>{JSON.stringify(selectedEvent.topicsDecoded, null, 2)}</pre>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Decoded Value Data</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-xs overflow-x-auto">
                  <pre>{JSON.stringify(selectedEvent.valueDecoded, null, 2)}</pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Raw Topics XDR Base64</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(selectedEvent.topicsRaw), 'topicsRaw')
                    }
                  >
                    {copiedId === 'topicsRaw' ? (
                      <Check className="h-3 w-3 mr-1 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copy Raw XDR
                  </Button>
                </div>
                <div className="p-2 bg-muted/60 border rounded font-mono text-[11px] text-muted-foreground break-all">
                  {selectedEvent.topicsRaw.join(', ') || 'None'}
                </div>
              </div>
            </CardContent>

            <div className="border-t p-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
