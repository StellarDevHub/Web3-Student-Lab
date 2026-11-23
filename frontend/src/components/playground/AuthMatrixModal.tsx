'use client';

import {
  CheckCircle2,
  ChevronDown,
  Key,
  Lock,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  TreeDeciduous,
  User,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthStatus = 'pending' | 'pass' | 'fail';

export type AuthNodeType = 'caller' | 'sub_contract' | 'and' | 'or' | 'threshold';

export interface AuthNode {
  id: string;
  type: AuthNodeType;
  address?: string;
  threshold?: number;
  children?: AuthNode[];
  status?: AuthStatus;
}

export interface MockCaller {
  id: string;
  address: string;
  label: string;
  role: 'admin' | 'user' | 'contract' | 'attacker';
}

export interface SignatureResult {
  caller: string;
  signature: string;
  timestamp: number;
  valid: boolean;
}

export interface AuthSimulationResult {
  nodeId: string;
  status: AuthStatus;
  message: string;
  timestamp: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

const MOCK_CALLERS: MockCaller[] = [
  {
    id: 'admin-1',
    address: 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
    label: 'Admin (Alice)',
    role: 'admin',
  },
  {
    id: 'user-1',
    address: 'GD5J6JFZ3VVHCCV4ZTE4D6KJPTGSQW2K6J2YZJQSBSDCGBHPF4MJSAAA',
    label: 'User (Bob)',
    role: 'user',
  },
  {
    id: 'contract-1',
    address: 'GABKQLK6L5ASX5F5E5Q5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y',
    label: 'Sub-Contract A',
    role: 'contract',
  },
  {
    id: 'contract-2',
    address: 'GACBQLK6L5ASX5F5E5Q5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y',
    label: 'Sub-Contract B',
    role: 'contract',
  },
  {
    id: 'attacker-1',
    address: 'GADKQLK6L5ASX5F5E5Q5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y',
    label: 'Attacker (Mallory)',
    role: 'attacker',
  },
];

const DEFAULT_AUTH_TREE: AuthNode = {
  id: 'root',
  type: 'caller',
  address: MOCK_CALLERS[0].address,
  status: 'pending',
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function generateMockSignature(address: string): string {
  const timestamp = Date.now();
  const prefix = 'sig_';
  const hash = btoa(`${address}:${timestamp}:${Math.random()}`).substring(0, 40);
  return `${prefix}${hash}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CallerDropdown({
  callers,
  selectedCaller,
  onSelect,
}: {
  callers: MockCaller[];
  selectedCaller: MockCaller | null;
  onSelect: (caller: MockCaller) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-left transition-all hover:border-white/20"
        aria-label="Select caller address"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
          <User className="h-4 w-4 text-red-400" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-white">
            {selectedCaller ? selectedCaller.label : 'Select Caller'}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            {selectedCaller ? truncateAddress(selectedCaller.address) : 'No address selected'}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 shadow-xl">
          <div className="max-h-64 overflow-y-auto p-2">
            {callers.map((caller) => (
              <button
                key={caller.id}
                onClick={() => {
                  onSelect(caller);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-white/5"
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    caller.role === 'admin'
                      ? 'bg-emerald-500/10'
                      : caller.role === 'attacker'
                        ? 'bg-red-500/10'
                        : 'bg-blue-500/10'
                  }`}
                >
                  <User
                    className={`h-3 w-3 ${
                      caller.role === 'admin'
                        ? 'text-emerald-400'
                        : caller.role === 'attacker'
                          ? 'text-red-400'
                          : 'text-blue-400'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-bold text-zinc-300">{caller.label}</div>
                  <div className="text-[9px] font-mono text-zinc-600">
                    {truncateAddress(caller.address)}
                  </div>
                </div>
                <div
                  className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                    caller.role === 'admin'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : caller.role === 'attacker'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-blue-500/10 text-blue-400'
                  }`}
                >
                  {caller.role}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SignatureGenerator({
  caller,
  onGenerate,
  generatedSignature,
}: {
  caller: MockCaller | null;
  onGenerate: (result: SignatureResult) => void;
  generatedSignature: SignatureResult | null;
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!caller) return;
    setIsGenerating(true);

    // Simulate signature generation delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const signature = generateMockSignature(caller.address);
    onGenerate({
      caller: caller.address,
      signature,
      timestamp: Date.now(),
      valid: caller.role !== 'attacker',
    });

    setIsGenerating(false);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Key className="h-4 w-4 text-zinc-400" />
        <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
          Mock Signature Generator
        </span>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleGenerate}
          disabled={!caller || isGenerating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[10px] font-black tracking-widest text-red-400 uppercase transition-all hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Generate Signature
            </>
          )}
        </button>

        {generatedSignature && (
          <div className="rounded-lg border border-white/5 bg-black/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-bold text-zinc-500 uppercase">Signature</span>
              <div className="flex items-center gap-1.5">
                {generatedSignature.valid ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-400" />
                )}
                <span
                  className={`text-[8px] font-black uppercase ${
                    generatedSignature.valid ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {generatedSignature.valid ? 'Valid' : 'Invalid'}
                </span>
              </div>
            </div>
            <div className="mb-2 font-mono text-[9px] text-zinc-400 break-all">
              {generatedSignature.signature}
            </div>
            <div className="flex items-center gap-2 text-[8px] text-zinc-600">
              <span>Caller: {truncateAddress(generatedSignature.caller)}</span>
              <span>·</span>
              <span>{new Date(generatedSignature.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthTreeBuilder({
  tree,
  onChange,
}: {
  tree: AuthNode;
  onChange: (tree: AuthNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const addSubNode = () => {
    const newNode: AuthNode = {
      id: `node-${Date.now()}`,
      type: 'sub_contract',
      address: MOCK_CALLERS[2].address,
      status: 'pending',
    };

    const updatedTree = {
      ...tree,
      type: 'and' as AuthNodeType,
      threshold: 1,
      children: [tree, newNode],
    };

    onChange(updatedTree);
  };

  const resetTree = () => {
    onChange(DEFAULT_AUTH_TREE);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TreeDeciduous className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            Auth Tree Builder
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/5 bg-black/50 p-3">
            <div className="mb-2 text-[9px] font-bold text-zinc-500 uppercase">Current Tree</div>
            <AuthTreeNode node={tree} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addSubNode}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[9px] font-black tracking-widest text-blue-400 uppercase transition-all hover:bg-blue-500/20"
            >
              <TreeDeciduous className="h-3 w-3" />
              Add Sub-Contract
            </button>
            <button
              onClick={resetTree}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black tracking-widest text-zinc-400 uppercase transition-all hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthTreeNode({ node, depth = 0 }: { node: AuthNode; depth?: number }) {
  const getStatusColor = (status?: AuthStatus) => {
    switch (status) {
      case 'pass':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'fail':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const getIcon = () => {
    if (node.type === 'caller') return <User className="h-3 w-3" />;
    if (node.type === 'sub_contract') return <Lock className="h-3 w-3" />;
    if (node.type === 'and' || node.type === 'or') return <TreeDeciduous className="h-3 w-3" />;
    return <Key className="h-3 w-3" />;
  };

  return (
    <div className="space-y-2" style={{ marginLeft: depth * 12 }}>
      <div
        className={`flex items-center gap-2 rounded-lg border p-2 ${getStatusColor(node.status)}`}
      >
        {getIcon()}
        <span className="text-[9px] font-mono">
          {node.type === 'caller' || node.type === 'sub_contract'
            ? truncateAddress(node.address || '')
            : node.type.toUpperCase()}
        </span>
        {node.status && (
          <span className="ml-auto text-[8px] font-black uppercase">{node.status}</span>
        )}
      </div>
      {node.children?.map((child) => (
        <AuthTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function SimulationResults({
  results,
  onClear,
}: {
  results: AuthSimulationResult[];
  onClear: () => void;
}) {
  if (results.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            Simulation Results
          </span>
        </div>
        <button
          onClick={onClear}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {results.map((result, index) => (
          <div
            key={`${result.nodeId}-${index}`}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              result.status === 'pass'
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-red-500/20 bg-red-500/5'
            }`}
          >
            <div className="mt-0.5">
              {result.status === 'pass' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle2 className="h-4 w-4 text-red-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="mb-1 text-[10px] font-bold text-zinc-300">
                {result.message}
              </div>
              <div className="text-[8px] text-zinc-500">
                Node: {result.nodeId} · {new Date(result.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface AuthMatrixModalProps {
  className?: string;
}

export function AuthMatrixModal({ className = '' }: AuthMatrixModalProps) {
  const [selectedCaller, setSelectedCaller] = useState<MockCaller | null>(null);
  const [authTree, setAuthTree] = useState<AuthNode>(DEFAULT_AUTH_TREE);
  const [generatedSignature, setGeneratedSignature] = useState<SignatureResult | null>(null);
  const [simulationResults, setSimulationResults] = useState<AuthSimulationResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const runSimulation = async () => {
    if (!selectedCaller || !generatedSignature) return;

    setIsSimulating(true);
    setSimulationResults([]);

    // Simulate auth check delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const results: AuthSimulationResult[] = [];

    // Check root node
    const isAuthorized =
      selectedCaller.role === 'admin' ||
      (authTree.type === 'caller' && authTree.address === selectedCaller.address);

    results.push({
      nodeId: authTree.id,
      status: isAuthorized ? 'pass' : 'fail',
      message: isAuthorized
        ? `require_auth passed for ${selectedCaller.label}`
        : `require_auth failed: ${selectedCaller.label} is not authorized`,
      timestamp: Date.now(),
    });

    // Check sub-contracts if they exist
    if (authTree.children) {
      for (const child of authTree.children) {
        const childAuth = child.address === selectedCaller.address;
        results.push({
          nodeId: child.id,
          status: childAuth ? 'pass' : 'fail',
          message: childAuth
            ? `Sub-contract auth passed`
            : `Sub-contract auth failed: address mismatch`,
          timestamp: Date.now(),
        });
      }
    }

    // Update tree status
    const updatedTree = {
      ...authTree,
      status: isAuthorized ? 'pass' : 'fail',
      children: authTree.children?.map((child, i) => ({
        ...child,
        status: results[i + 1]?.status,
      })),
    };

    setAuthTree(updatedTree);
    setSimulationResults(results);
    setIsSimulating(false);
  };

  const clearResults = () => {
    setSimulationResults([]);
    setAuthTree({ ...authTree, status: 'pending' });
  };

  const passCount = simulationResults.filter((r) => r.status === 'pass').length;
  const failCount = simulationResults.filter((r) => r.status === 'fail').length;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-red-400" />
          <h3 className="text-sm font-black tracking-widest text-white uppercase">
            Authorization Matrix
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {passCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-[9px] font-bold text-emerald-400">{passCount} Pass</span>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1">
              <XCircle className="h-3 w-3 text-red-400" />
              <span className="text-[9px] font-bold text-red-400">{failCount} Fail</span>
            </div>
          )}
        </div>
      </div>

      {/* Caller Selection */}
      <CallerDropdown
        callers={MOCK_CALLERS}
        selectedCaller={selectedCaller}
        onSelect={setSelectedCaller}
      />

      {/* Signature Generator */}
      <SignatureGenerator
        caller={selectedCaller}
        onGenerate={setGeneratedSignature}
        generatedSignature={generatedSignature}
      />

      {/* Auth Tree Builder */}
      <AuthTreeBuilder tree={authTree} onChange={setAuthTree} />

      {/* Simulation Controls */}
      <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Play className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            Simulation Controls
          </span>
        </div>

        <button
          onClick={runSimulation}
          disabled={!selectedCaller || !generatedSignature || isSimulating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[10px] font-black tracking-widest text-red-400 uppercase transition-all hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSimulating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Simulating Authorization...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Run Authorization Simulation
            </>
          )}
        </button>
      </div>

      {/* Simulation Results */}
      <SimulationResults results={simulationResults} onClear={clearResults} />
    </div>
  );
}

export default AuthMatrixModal;
