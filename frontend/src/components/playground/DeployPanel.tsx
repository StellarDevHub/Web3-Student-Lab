'use client';

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, CheckCircle, ClipboardCopy, ExternalLink, Loader2, Play, RefreshCw, Terminal, XCircle, Rocket } from 'lucide-react';

// ------------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------------

export type DeployStage = 'upload' | 'install' | 'instantiate' | 'initialize';

export type StageStatus = 'pending' | 'active' | 'success' | 'error';

export interface StageState {
  stage: DeployStage;
  status: StageStatus;
  label: string;
  description: string;
  message?: string;
  hash?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ConstructorArgument {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'address' | 'symbol' | 'bytes';
  value: string;
  required?: boolean;
  description?: string;
}

export interface DeployResult {
  contractId: string;
  wasmHash: string;
  installTxHash: string;
  instantiateTxHash: string;
  initializeTxHash?: string;
  explorerUrl: string;
  verified: boolean;
}

export interface DeployPanelProps {
  /** WASM bytes to deploy (from build or upload). */
  wasmBytes?: Uint8Array | ArrayBuffer | null;
  /** Name of the contract for display/logging. */
  contractName?: string;
  /** Stellar network to deploy to. */
  network?: 'testnet' | 'futurenet' | 'mainnet';
  /** Soroban RPC URL to use. */
  rpcUrl?: string;
  /** Network passphrase for transaction signing. */
  networkPassphrase?: string;
  /** Secret key of the deployer account (Stellar S...) */
  secretKey?: string;
  /** Public key of the deployer account (G...) */
  publicKey?: string;
  /** Constructor arguments to pass to the contract. */
  constructorArgs?: ConstructorArgument[];
  /** Optional initialization arguments (for the initialize call). */
  initializeArgs?: ConstructorArgument[];
  /** Called when deployment completes successfully. */
  onDeployed?: (result: DeployResult) => void;
  /** Called on any error. */
  onError?: (error: Error) => void;
  /** Optional external deploy function (for testing/injection). */
  deployOverride?: (input: DeployInput) => Promise<DeployResult>;
}

export interface DeployInput {
  wasmBytes: Uint8Array;
  contractName: string;
  network: 'testnet' | 'futurenet' | 'mainnet';
  rpcUrl: string;
  networkPassphrase: string;
  secretKey: string;
  publicKey: string;
  constructorArgs: ConstructorArgument[];
  initializeArgs: ConstructorArgument[];
  onStageUpdate: (stage: DeployStage, update: Partial<StageState>) => void;
}

// ------------------------------------------------------------------------------
// Network configuration
// ------------------------------------------------------------------------------

const NETWORK_CONFIGS: Record<string, { rpcUrl: string; passphrase: string; explorer: string }> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test Stellar Network ; September 2015',
    explorer: 'https://stellar.expert/explorer/testnet',
  },
  futurenet: {
    rpcUrl: 'https://soroban-futurenet.stellar.org',
    passphrase: 'Test Stellar Network ; September 2015',
    explorer: 'https://stellar.expert/explorer/futurenet',
  },
  mainnet: {
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
    explorer: 'https://stellar.expert/explorer/public',
  },
};

const STAGE_DEFINITIONS: Array<{ stage: DeployStage; label: string; description: string }> = [
  {
    stage: 'upload',
    label: 'Upload WASM',
    description: 'Upload compiled WASM bytecode to the network',
  },
  {
    stage: 'install',
    label: 'Install Contract',
    description: 'Install the WASM and create a contract instance',
  },
  {
    stage: 'instantiate',
    label: 'Instantiate',
    description: 'Create the contract instance with constructor arguments',
  },
  {
    stage: 'initialize',
    label: 'Initialize State',
    description: 'Invoke the contract initializer and verify on Stellar Expert',
  },
];

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

function toUint8Array(input: Uint8Array | ArrayBuffer | null | undefined): Uint8Array {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildExplorerUrl(network: string, contractId: string): string {
  const config = NETWORK_CONFIGS[network] ?? NETWORK_CONFIGS.testnet;
  return `${config.explorer}/contract/${contractId}`;
}

// ------------------------------------------------------------------------------
// Reducer
// ------------------------------------------------------------------------------

type State = {
  stages: Record<DeployStage, StageState>;
  isRunning: boolean;
  result: DeployResult | null;
  error: string | null;
  logs: Array<{ timestamp: number; message: string; level: 'info' | 'error' | 'success' }>;
};

type Action =
  | { type: 'RESET' }
  | { type: 'START_RUN' }
  | { type: 'STAGE_UPDATE'; stage: DeployStage; update: Partial<StageState> }
  | { type: 'SUCCESS'; result: DeployResult }
  | { type: 'FAILURE'; error: string; stage?: DeployStage }
  | { type: 'LOG'; message: string; level?: 'info' | 'error' | 'success' };

const initialStages = (): Record<DeployStage, StageState> => {
  const entries = STAGE_DEFINITIONS.map((def) => [
    def.stage,
    { stage: def.stage, status: 'pending' as StageStatus, label: def.label, description: def.description },
  ]);
  return Object.fromEntries(entries) as Record<DeployStage, StageState>;
};

const initialState: State = {
  stages: initialStages(),
  isRunning: false,
  result: null,
  error: null,
  logs: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return {
        ...initialState,
        stages: initialStages(),
        logs: [],
      };
    case 'START_RUN':
      return {
        ...state,
        isRunning: true,
        error: null,
        result: null,
        stages: initialStages(),
        logs: [
          ...state.logs,
          { timestamp: Date.now(), message: 'Deployment pipeline started', level: 'info' },
        ],
      };
    case 'STAGE_UPDATE':
      return {
        ...state,
        stages: {
          ...state.stages,
          [action.stage]: {
            ...state.stages[action.stage],
            ...action.update,
          },
        },
      };
    case 'SUCCESS':
      return {
        ...state,
        isRunning: false,
        result: action.result,
        logs: [
          ...state.logs,
          { timestamp: Date.now(), message: `Deployment complete: ${action.result.contractId}`, level: 'success' },
        ],
      };
    case 'FAILURE':
      return {
        ...state,
        isRunning: false,
        error: action.error,
        stages: action.stage
          ? {
              ...state.stages,
              [action.stage]: { ...state.stages[action.stage], status: 'error', message: action.error },
            }
          : state.stages,
        logs: [
          ...state.logs,
          { timestamp: Date.now(), message: `Deployment failed: ${action.error}`, level: 'error' },
        ],
      };
    case 'LOG':
      return {
        ...state,
        logs: [
          ...state.logs,
          { timestamp: Date.now(), message: action.message, level: action.level ?? 'info' },
        ],
      };
    default:
      return state;
  }
}

// ------------------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------------------

function StageIndicator({ stage, index }: { stage: StageState; index: number }) {
  const icon = (() => {
    switch (stage.status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'active':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-400" />;
      default:
        return (
          <span className="flex items-center justify-center w-5 h-5 rounded-full border border-slate-600 text-xs text-slate-400">
            {index + 1}
          </span>
        );
    }
  })();

  const borderColor =
    stage.status === 'success'
      ? 'border-emerald-500/40'
      : stage.status === 'error'
        ? 'border-red-500/40'
        : stage.status === 'active'
          ? 'border-blue-500/60 bg-blue-500/5'
          : 'border-slate-700/60';

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${borderColor}`}>
      <div className="flex-shrink-0 pt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-100">{stage.label}</span>
          {stage.hash && (
            <span className="font-mono text-[10px] text-slate-500">
              {stage.hash.slice(0, 10)}...
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>
        {stage.message && (
          <p
            className={
              'text-[11px] mt-1 font-mono ' +
              (stage.status === 'error' ? 'text-red-400' : 'text-emerald-400')
            }
          >
            {stage.message}
          </p>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable - silently ignore
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/60 transition-colors"
      aria-label={label ?? 'Copy'}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function ArgumentEditor({
  args,
  onChange,
  title,
  description,
}: {
  args: ConstructorArgument[];
  onChange: (args: ConstructorArgument[]) => void;
  title: string;
  description?: string;
}) {
  const updateArg = (index: number, patch: Partial<ConstructorArgument>) => {
    const next = args.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const addArg = () => {
    onChange([
      ...args,
      { name: `arg${args.length + 1}`, type: 'string', value: '', required: true },
    ]);
  };

  const removeArg = (index: number) => {
    onChange(args.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={addArg}
          className="rounded-md border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/60"
        >
          + Add argument
        </button>
      </div>

      {args.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
          No arguments. Add one if the constructor requires inputs.
        </p>
      )}

      <div className="space-y-2">
        {args.map((arg, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-4 rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              placeholder="name"
              value={arg.name}
              onChange={(e) => updateArg(index, { name: e.target.value })}
            />
            <select
              className="col-span-3 rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              value={arg.type}
              onChange={(e) => updateArg(index, { type: e.target.value as ConstructorArgument['type'] })}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="address">address</option>
              <option value="symbol">symbol</option>
              <option value="bytes">bytes</option>
            </select>
            <input
              className="col-span-4 rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              placeholder="value"
              value={arg.value}
              onChange={(e) => updateArg(index, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeArg(index)}
              className="col-span-1 rounded-md border border-slate-700 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 hover:bg-red-500/20 hover:text-red-300"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------------------

export function DeployPanel({
  wasmBytes,
  contractName = 'untitled-contract',
  network = 'testnet',
  rpcUrl,
  networkPassphrase,
  secretKey,
  publicKey,
  constructorArgs,
  initializeArgs,
  onDeployed,
  onError,
  deployOverride,
}: DeployPanelProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [localConstructorArgs, setLocalConstructorArgs] = useState<ConstructorArgument[]>(constructorArgs ?? []);
  const [localInitializeArgs, setLocalInitializeArgs] = useState<ConstructorArgument[]>(initializeArgs ?? []);
  const [secretKeyInput, setSecretKeyInput] = useState(secretKey ?? '');
  const logRef = useRef<HTMLDivElement | null>(null);

  const networkConfig = NETWORK_CONFIGS[network] ?? NETWORK_CONFIGS.testnet;
  const effectiveRpcUrl = rpcUrl ?? networkConfig.rpcUrl;
  const effectivePassphrase = networkPassphrase ?? networkConfig.passphrase;

  const wasmUint8 = useMemo(() => toUint8Array(wasmBytes), [wasmBytes]);
  const wasmSize = wasmUint8.byteLength;
  const wasmHashPreview = useMemo(() => (wasmSize > 0 ? bytesToHex(wasmUint8.slice(0, 8)) : ''), [wasmUint8, wasmSize]);

  const canDeploy = useMemo(() => {
    if (state.isRunning) return false;
    if (wasmSize === 0) return false;
    if (!secretKeyInput.trim()) return false;
    const missing = localConstructorArgs.some((a) => a.required && !a.value.trim());
    return !missing;
  }, [state.isRunning, wasmSize, secretKeyInput, localConstructorArgs]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.logs]);

  const handleStageUpdate = useCallback(
    (stage: DeployStage, update: Partial<StageState>) => {
      dispatch({ type: 'STAGE_UPDATE', stage, update });
      if (update.message) {
        dispatch({
          type: 'LOG',
          message: `[${stage}] ${update.message}`,
          level: update.status === 'error' ? 'error' : 'info',
        });
      }
    },
    [],
  );

  const handleDeploy = useCallback(async () => {
    if (!canDeploy) return;
    dispatch({ type: 'START_RUN' });

    const input: DeployInput = {
      wasmBytes: wasmUint8,
      contractName,
      network,
      rpcUrl: effectiveRpcUrl,
      networkPassphrase: effectivePassphrase,
      secretKey: secretKeyInput.trim(),
      publicKey: publicKey ?? '',
      constructorArgs: localConstructorArgs,
      initializeArgs: localInitializeArgs,
      onStageUpdate: handleStageUpdate,
    };

    try {
      if (!deployOverride) {
        throw new Error('Deployment pipeline requires live Soroban connection or deployOverride in test mode.');
      }
      const result = await deployOverride(input);
      dispatch({ type: 'SUCCESS', result });
      onDeployed?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'FAILURE', error: message });
      onError?.(err instanceof Error ? err : new Error(message));
    }
  }, [
    canDeploy,
    wasmUint8,
    contractName,
    network,
    effectiveRpcUrl,
    effectivePassphrase,
    secretKeyInput,
    publicKey,
    localConstructorArgs,
    localInitializeArgs,
    handleStageUpdate,
    deployOverride,
    onDeployed,
    onError,
  ]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const stageOrder = STAGE_DEFINITIONS.map((s) => s.stage);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-slate-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Deploy Contract</h2>
            <p className="text-xs text-slate-500">
              {contractName} <span className="text-slate-600">·</span> {network}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.result && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/60"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Deploy again
            </button>
          )}
        </div>
      </div>

      {/* WASM source summary */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-300">WASM bytecode</span>
          {wasmSize > 0 ? (
            <span className="font-mono text-[11px] text-slate-400">
              {wasmSize.toLocaleString()} bytes · {wasmHashPreview}...
            </span>
          ) : (
            <span className="text-[11px] text-amber-400">No WASM loaded</span>
          )}
        </div>
      </div>

      {/* Deployer key */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-300">Deployer secret key</label>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          placeholder="S..."
          value={secretKeyInput}
          onChange={(e) => setSecretKeyInput(e.target.value)}
        />
        <p className="text-[10px] text-slate-500">
          Keys are kept in memory only and never sent anywhere except the Soroban RPC.
        </p>
      </div>

      {/* Constructor arguments */}
      <ArgumentEditor
        title="Constructor arguments"
        description="Passed to the contract at instantiation time."
        args={localConstructorArgs}
        onChange={setLocalConstructorArgs}
      />

      {/* Initialize arguments */}
      <ArgumentEditor
        title="Initialize arguments (optional)"
        description="Invoked after instantiation to seed initial contract state."
        args={localInitializeArgs}
        onChange={setLocalInitializeArgs}
      />

      {/* Stage tracker */}
      <div className="space-y-2">
        {stageOrder.map((stage, index) => (
          <StageIndicator key={stage} stage={state.stages[stage]} index={index} />
        ))}
      </div>

      {/* Logs */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>Deployment log</span>
        </div>
        <div
          ref={logRef}
          className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-slate-300"
        >
          {state.logs.length === 0 ? (
            <span className="text-slate-600">Waiting for deployment…</span>
          ) : (
            state.logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.level === 'error'
                    ? 'text-red-400'
                    : log.level === 'success'
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                }
              >
                <span className="text-slate-600">
                  {new Date(log.timestamp).toLocaleTimeString()}{' '}
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {state.error}
        </div>
      )}

      {/* Result */}
      {state.result && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-200">
              {state.result.verified ? 'Verified on Stellar Expert' : 'Deployed'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Contract ID
              </span>
              <CopyButton value={state.result.contractId} label="Copy contract ID" />
            </div>
            <div className="font-mono text-[11px] text-slate-200 break-all">
              {state.result.contractId}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div>
              <span className="block uppercase tracking-wide">WASM hash</span>
              <span className="font-mono text-slate-300 break-all">{state.result.wasmHash}</span>
            </div>
            <div>
              <span className="block uppercase tracking-wide">Install tx</span>
              <span className="font-mono text-slate-300 break-all">{state.result.installTxHash}</span>
            </div>
            <div>
              <span className="block uppercase tracking-wide">Instantiate tx</span>
              <span className="font-mono text-slate-300 break-all">{state.result.instantiateTxHash}</span>
            </div>
            {state.result.initializeTxHash && (
              <div>
                <span className="block uppercase tracking-wide">Initialize tx</span>
                <span className="font-mono text-slate-300 break-all">{state.result.initializeTxHash}</span>
              </div>
            )}
          </div>

          <a
            href={state.result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View on Stellar Expert
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDeploy}
          disabled={!canDeploy}
          className={
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ' +
            (canDeploy
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'cursor-not-allowed bg-slate-800 text-slate-500')
          }
        >
          {state.isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deploying…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Deploy Contract
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default DeployPanel;
