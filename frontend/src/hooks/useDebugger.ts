import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Frame {
  id: string;
  functionName: string;
  contractId: string;
  parameters: Record<string, unknown>;
  returnType: string;
  depth: number;
  gasUsed: number;
}

export interface Step {
  id: number;
  type:
    | 'function_call'
    | 'function_return'
    | 'storage_read'
    | 'storage_write'
    | 'variable_mutation'
    | 'error'
    | 'gas_checkpoint';
  description: string;
  line?: number;
  timestamp: number;
  gasConsumed: number;
  stateDiff?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
}

export interface WatchExpression {
  id: string;
  expression: string;
  value: unknown;
  error?: string;
}

export interface DebuggerState {
  isPaused: boolean;
  isRunning: boolean;
  currentStep: number;
  totalSteps: number;
  callStack: Frame[];
  localVariables: Map<string, unknown>;
  contractStorage: Map<string, unknown>;
  executionHistory: Step[];
  breakpoints: Set<number>;
  watchExpressions: WatchExpression[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Mock execution engine
// Simulates Soroban contract step execution. In production this would
// connect to a real Soroban debug RPC / instrumented WASM runner.
// ---------------------------------------------------------------------------

function generateMockSteps(contractCode: string): Step[] {
  const lines = contractCode.split('\n').filter((l) => l.trim());
  const steps: Step[] = [];

  const types: Step['type'][] = [
    'function_call',
    'storage_read',
    'variable_mutation',
    'storage_write',
    'function_return',
  ];

  let gas = 0;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    let type: Step['type'] = types[i % types.length];
    let description = `Execute: ${trimmed.slice(0, 60)}`;

    if (trimmed.includes('fn ')) {
      type = 'function_call';
      const fnMatch = trimmed.match(/fn\s+(\w+)/);
      description = `Call function: ${fnMatch?.[1] ?? 'anonymous'}`;
    } else if (trimmed.includes('env.storage')) {
      type = trimmed.includes('get') ? 'storage_read' : 'storage_write';
      description =
        type === 'storage_read' ? 'Read from contract storage' : 'Write to contract storage';
    } else if (trimmed.includes('let ') || trimmed.includes('=')) {
      type = 'variable_mutation';
      const varMatch = trimmed.match(/let\s+(\w+)/);
      description = `Mutate variable: ${varMatch?.[1] ?? 'unknown'}`;
    } else if (trimmed.includes('return')) {
      type = 'function_return';
      description = 'Return from function';
    }

    gas += Math.floor(Math.random() * 500) + 100;

    steps.push({
      id: steps.length,
      type,
      description,
      line: i + 1,
      timestamp: Date.now() + i * 10,
      gasConsumed: gas,
      stateDiff:
        type === 'storage_write' || type === 'variable_mutation'
          ? {
              before: { value: Math.floor(Math.random() * 100) },
              after: { value: Math.floor(Math.random() * 100) + 10 },
            }
          : undefined,
    });
  });

  return steps;
}

function generateMockCallStack(step: number, steps: Step[]): Frame[] {
  const current = steps[step];
  if (!current) return [];

  const base: Frame = {
    id: 'frame-0',
    functionName: 'initialize',
    contractId: 'CABC...XYZ',
    parameters: { admin: 'GABC...123', initial_balance: 1000 },
    returnType: '()',
    depth: 0,
    gasUsed: Math.floor(current.gasConsumed * 0.3),
  };

  if (step < steps.length / 3) return [base];

  const mid: Frame = {
    id: 'frame-1',
    functionName: 'transfer',
    contractId: 'CABC...XYZ',
    parameters: { from: 'GABC...123', to: 'GDEF...456', amount: 500 },
    returnType: 'Result<(), Error>',
    depth: 1,
    gasUsed: Math.floor(current.gasConsumed * 0.5),
  };

  if (step < (steps.length * 2) / 3) return [base, mid];

  const deep: Frame = {
    id: 'frame-2',
    functionName: 'check_balance',
    contractId: 'CABC...XYZ',
    parameters: { account: 'GABC...123' },
    returnType: 'i128',
    depth: 2,
    gasUsed: Math.floor(current.gasConsumed * 0.2),
  };

  return [base, mid, deep];
}

function generateMockVariables(step: number): Map<string, unknown> {
  const vars = new Map<string, unknown>();
  vars.set('env', '[Environment]');
  vars.set('admin', 'GABC...DEF123');
  vars.set('balance', 1000 - step * 10);
  vars.set('is_authorized', step > 2);
  vars.set('transfer_count', Math.floor(step / 3));
  if (step > 5) vars.set('recipient', 'GXYZ...789');
  if (step > 8) vars.set('fee', 0.003);
  return vars;
}

function generateMockStorage(step: number): Map<string, unknown> {
  const storage = new Map<string, unknown>();
  storage.set('DataKey::Balance(GABC...)', 1000 - step * 10);
  storage.set('DataKey::Admin', 'GABC...DEF123');
  storage.set('DataKey::TotalSupply', 1_000_000);
  if (step > 3) storage.set('DataKey::Balance(GXYZ...)', step * 10);
  if (step > 6) storage.set('DataKey::Allowance(GABC...,GXYZ...)', 500);
  return storage;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(env: Env, admin: Address, supply: i128) {
        let storage = env.storage().instance();
        storage.set(&Symbol::new(&env, "admin"), &admin);
        storage.set(&Symbol::new(&env, "supply"), &supply);
        storage.set(&Symbol::new(&env, "balance"), &supply);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let storage = env.storage().instance();
        let from_balance: i128 = storage
            .get(&Symbol::new(&env, "balance"))
            .unwrap_or(0);
        if from_balance < amount {
            panic!("Insufficient balance");
        }
        storage.set(&Symbol::new(&env, "balance"), &(from_balance - amount));
    }

    pub fn get_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "balance"))
            .unwrap_or(0)
    }
}`;

export function useDebugger() {
  const [contractCode, setContractCode] = useState(DEFAULT_CONTRACT);
  const [state, setState] = useState<DebuggerState>({
    isPaused: false,
    isRunning: false,
    currentStep: 0,
    totalSteps: 0,
    callStack: [],
    localVariables: new Map(),
    contractStorage: new Map(),
    executionHistory: [],
    breakpoints: new Set(),
    watchExpressions: [],
    error: null,
  });

  const stepsRef = useRef<Step[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load / initialise ──────────────────────────────────────────────────────

  const loadContract = useCallback((code: string) => {
    setContractCode(code);
    const steps = generateMockSteps(code);
    stepsRef.current = steps;
    setState((prev) => ({
      ...prev,
      isPaused: false,
      isRunning: false,
      currentStep: 0,
      totalSteps: steps.length,
      executionHistory: steps,
      callStack: [],
      localVariables: new Map(),
      contractStorage: new Map(),
      error: null,
    }));
  }, []);

  const syncStepState = useCallback((step: number) => {
    const steps = stepsRef.current;
    setState((prev) => ({
      ...prev,
      currentStep: step,
      callStack: generateMockCallStack(step, steps),
      localVariables: generateMockVariables(step),
      contractStorage: generateMockStorage(step),
    }));
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────

  const startDebugging = useCallback(() => {
    const steps = generateMockSteps(contractCode);
    stepsRef.current = steps;
    setState((prev) => ({
      ...prev,
      isRunning: true,
      isPaused: true,
      currentStep: 0,
      totalSteps: steps.length,
      executionHistory: steps,
      callStack: generateMockCallStack(0, steps),
      localVariables: generateMockVariables(0),
      contractStorage: generateMockStorage(0),
      error: null,
    }));
  }, [contractCode]);

  const stepForward = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= prev.totalSteps - 1) return prev;
      const next = prev.currentStep + 1;
      return {
        ...prev,
        currentStep: next,
        callStack: generateMockCallStack(next, stepsRef.current),
        localVariables: generateMockVariables(next),
        contractStorage: generateMockStorage(next),
      };
    });
  }, []);

  const stepBackward = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 0) return prev;
      const next = prev.currentStep - 1;
      return {
        ...prev,
        currentStep: next,
        callStack: generateMockCallStack(next, stepsRef.current),
        localVariables: generateMockVariables(next),
        contractStorage: generateMockStorage(next),
      };
    });
  }, []);

  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPaused: false }));
    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.currentStep >= prev.totalSteps - 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return { ...prev, isPaused: true, isRunning: false };
        }
        // Stop at breakpoints
        const next = prev.currentStep + 1;
        const currentStepData = stepsRef.current[next];
        if (prev.breakpoints.has(currentStepData?.line ?? -1)) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return {
            ...prev,
            isPaused: true,
            currentStep: next,
            callStack: generateMockCallStack(next, stepsRef.current),
            localVariables: generateMockVariables(next),
            contractStorage: generateMockStorage(next),
          };
        }
        return {
          ...prev,
          currentStep: next,
          callStack: generateMockCallStack(next, stepsRef.current),
          localVariables: generateMockVariables(next),
          contractStorage: generateMockStorage(next),
        };
      });
    }, 400);
  }, []);

  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState((prev) => ({ ...prev, isPaused: true }));
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState((prev) => ({
      ...prev,
      isPaused: false,
      isRunning: false,
      currentStep: 0,
      callStack: [],
      localVariables: new Map(),
      contractStorage: new Map(),
    }));
  }, []);

  const jumpToStep = useCallback(
    (step: number) => {
      const clamped = Math.max(0, Math.min(step, stepsRef.current.length - 1));
      syncStepState(clamped);
    },
    [syncStepState]
  );

  // ── Breakpoints ────────────────────────────────────────────────────────────

  const toggleBreakpoint = useCallback((line: number) => {
    setState((prev) => {
      const bp = new Set(prev.breakpoints);
      if (bp.has(line)) bp.delete(line);
      else bp.add(line);
      return { ...prev, breakpoints: bp };
    });
  }, []);

  const clearBreakpoints = useCallback(() => {
    setState((prev) => ({ ...prev, breakpoints: new Set() }));
  }, []);

  // ── Watch expressions ──────────────────────────────────────────────────────

  const addWatchExpression = useCallback((expression: string) => {
    setState((prev) => ({
      ...prev,
      watchExpressions: [
        ...prev.watchExpressions,
        {
          id: crypto.randomUUID(),
          expression,
          value: Math.floor(Math.random() * 1000),
        },
      ],
    }));
  }, []);

  const removeWatchExpression = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      watchExpressions: prev.watchExpressions.filter((w) => w.id !== id),
    }));
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportTrace = useCallback(() => {
    const trace = {
      contractCode,
      steps: stepsRef.current,
      breakpoints: Array.from(state.breakpoints),
      totalGas: stepsRef.current[stepsRef.current.length - 1]?.gasConsumed ?? 0,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(trace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soroban-execution-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [contractCode, state.breakpoints]);

  return {
    contractCode,
    setContractCode,
    state,
    loadContract,
    startDebugging,
    stepForward,
    stepBackward,
    play,
    pause,
    stop,
    jumpToStep,
    toggleBreakpoint,
    clearBreakpoints,
    addWatchExpression,
    removeWatchExpression,
    exportTrace,
  };
}
