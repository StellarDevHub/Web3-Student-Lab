'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Hash,
  Key,
  Lock,
  Shield,
  Terminal,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  OPERATIONS,
  visualizeECDSASign,
  visualizeHMAC,
  visualizeHash,
  visualizeRSAEncrypt,
  visualizeSymmetricEncrypt,
} from '@/lib/crypto-visualizer';
import type { CryptoOperationDef, VisualizerResult, VisualizerStep } from '@/lib/crypto-visualizer';

const OPERATION_ICONS: Record<string, React.ReactNode> = {
  hash: <Hash className="h-4 w-4" aria-hidden="true" />,
  symmetric: <Key className="h-4 w-4" aria-hidden="true" />,
  asymmetric: <Lock className="h-4 w-4" aria-hidden="true" />,
  hmac: <Shield className="h-4 w-4" aria-hidden="true" />,
  signature: <Terminal className="h-4 w-4" aria-hidden="true" />,
};

async function runOperation(
  opId: string,
  input: string,
  secretKey: string
): Promise<VisualizerResult> {
  switch (opId) {
    case 'hash':
      return visualizeHash(input);
    case 'symmetric':
      return visualizeSymmetricEncrypt(input);
    case 'asymmetric':
      return visualizeRSAEncrypt(input);
    case 'hmac':
      return visualizeHMAC(secretKey, input);
    case 'ecdsa':
      return visualizeECDSASign(input);
    default:
      throw new Error(`Unknown operation: ${opId}`);
  }
}

const EXAMPLE_INPUTS: Record<string, string> = {
  hash: 'Hello, Web3 World!',
  symmetric: 'Transfer 100 XLM to GA7OP...',
  asymmetric: 'This is a secret message.',
  hmac: 'POST /api/transfer HTTP/1.1',
  ecdsa: 'Deploy contract: hello_world',
};

export function CryptoVisualizer() {
  const [selectedOp, setSelectedOp] = useState<CryptoOperationDef>(OPERATIONS[0]);
  const [input, setInput] = useState(EXAMPLE_INPUTS[OPERATIONS[0].id]);
  const [secretKey, setSecretKey] = useState('my-secret-key-123');
  const [result, setResult] = useState<VisualizerResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const handleOpChange = useCallback((op: CryptoOperationDef) => {
    setSelectedOp(op);
    setInput(EXAMPLE_INPUTS[op.id]);
    setResult(null);
    setError(null);
    setExpandedSteps(new Set());
  }, []);

  const handleRun = useCallback(async () => {
    if (!input.trim()) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runOperation(selectedOp.id, input, secretKey);
      setResult(res);
      setExpandedSteps(new Set(res.steps.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setIsRunning(false);
    }
  }, [selectedOp.id, input, secretKey]);

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-red-500" aria-hidden="true" />
          <h3 className="text-sm font-black tracking-widest uppercase">
            Interactive <span className="text-red-500">Cryptography</span> Visualizer
          </h3>
        </div>
        <span className="text-[10px] text-gray-600">{OPERATIONS.length} operations</span>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 lg:flex-row">
        {/* Left: Controls */}
        <div className="flex w-full flex-col gap-6 lg:w-80 lg:shrink-0">
          {/* Operation Tabs */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Cryptography operation">
            {OPERATIONS.map((op) => (
              <button
                key={op.id}
                onClick={() => handleOpChange(op)}
                role="tab"
                aria-selected={selectedOp.id === op.id}
                aria-controls="crypto-panel"
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                  selectedOp.id === op.id
                    ? 'border-red-500/50 bg-red-500/10 text-red-500'
                    : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {OPERATION_ICONS[op.category]}
                <span>{op.name}</span>
              </button>
            ))}
          </div>

          {/* Description */}
          <p className="text-[11px] leading-relaxed text-gray-500">{selectedOp.description}</p>

          {/* Input */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="crypto-input"
              className="text-[10px] font-bold tracking-widest text-gray-400 uppercase"
            >
              Input Message
            </label>
            <textarea
              id="crypto-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[80px] rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs text-white outline-none transition-colors focus:border-red-500/50"
              placeholder="Enter your message here..."
              aria-label="Input message for cryptographic operation"
            />
          </div>

          {/* Secret Key (for HMAC) */}
          {selectedOp.requiresKey && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="crypto-key"
                className="text-[10px] font-bold tracking-widest text-gray-400 uppercase"
              >
                Secret Key
              </label>
              <input
                id="crypto-key"
                type="text"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs text-white outline-none transition-colors focus:border-red-500/50"
                aria-label="Secret key for HMAC operation"
              />
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={isRunning || !input.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-xs font-black tracking-widest text-white uppercase transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Run ${selectedOp.name}`}
          >
            {isRunning ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Processing...
              </>
            ) : (
              <>Run {selectedOp.name}</>
            )}
          </button>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              <div className="text-[11px] text-red-400">{error}</div>
            </div>
          )}
        </div>

        {/* Right: Visualization */}
        <div
          id="crypto-panel"
          role="tabpanel"
          className="flex flex-1 flex-col gap-4"
          aria-label={`${selectedOp.name} visualization results`}
        >
          {!result && !error && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Cpu className="mx-auto mb-4 h-12 w-12 text-gray-700" aria-hidden="true" />
                <p className="text-sm font-bold text-gray-600">
                  Select an operation and click Run
                </p>
                <p className="mt-1 text-[10px] text-gray-700">
                  Watch each cryptographic step visualized in detail
                </p>
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Output Summary */}
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  <span className="text-[10px] font-bold tracking-widest text-green-500 uppercase">
                    {selectedOp.name} Complete
                  </span>
                </div>
                <div className="rounded-lg bg-black/50 p-3">
                  <div className="mb-1 text-[9px] font-bold tracking-widest text-gray-500 uppercase">
                    Output
                  </div>
                  <div className="break-all font-mono text-xs text-white">{result.output}</div>
                </div>
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-3">
                <h4 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                  Step-by-Step Breakdown
                </h4>
                {result.steps.map((step, index) => (
                  <StepCard
                    key={index}
                    step={step}
                    index={index}
                    isExpanded={expandedSteps.has(index)}
                    onToggle={() => toggleStep(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  isExpanded,
  onToggle,
}: {
  step: VisualizerStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 transition-colors hover:border-white/20">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={isExpanded}
        aria-label={`${step.label}. ${isExpanded ? 'Collapse' : 'Expand'} details`}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-black text-red-500">
          {index + 1}
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-white">{step.label}</div>
          <div className="text-[10px] text-gray-500">{step.description}</div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-white/5 px-4 py-3">
          <dl className="space-y-2">
            {step.details.map((detail, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <dt className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">
                  {detail.label}
                </dt>
                <dd className="break-all font-mono text-[11px] text-gray-300">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
