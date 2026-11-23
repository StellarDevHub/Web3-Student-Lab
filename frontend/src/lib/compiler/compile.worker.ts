/// <reference lib="webworker" />

import type { CompileLogEntry, CompileWorkerCompleteMessage } from './compileTypes';
import type {
  CancellableCompileRequest,
  CancellableWorkerCancelledMessage,
  CancellableWorkerCompleteMessage,
  CancellableWorkerInbound,
  CancellableWorkerLogMessage,
  WorkerCancelMessage,
} from './cancellationTypes';

type WorkerSelf = typeof self & { postMessage(message: unknown): void };
const workerSelf = self as WorkerSelf;

/** Set of cancellation IDs that have been cancelled while in-flight. */
const cancelledIds = new Set<string>();

function formatTimestamp(): string {
  return new Date().toLocaleTimeString();
}

function createLog(level: CompileLogEntry['level'], message: string): CompileLogEntry {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    timestamp: formatTimestamp(),
    message,
  };
}

function postLog(cancellationId: string, level: CompileLogEntry['level'], message: string): void {
  const msg: CancellableWorkerLogMessage = {
    type: 'log',
    cancellationId,
    entry: createLog(level, message),
  };
  workerSelf.postMessage(msg);
}

function postComplete(
  cancellationId: string,
  payload: Omit<CancellableWorkerCompleteMessage, 'type' | 'cancellationId'>
): void {
  const msg: CancellableWorkerCompleteMessage = {
    type: 'complete',
    cancellationId,
    ...payload,
  };
  workerSelf.postMessage(msg);
}

function postCancelled(cancellationId: string): void {
  const msg: CancellableWorkerCancelledMessage = {
    type: 'cancelled',
    cancellationId,
  };
  workerSelf.postMessage(msg);
}

/**
 * Cancellable sleep — resolves false when the cancellation ID is marked during
 * the delay, resolves true when the timer fires normally.
 */
function sleep(ms: number, cancellationId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (cancelledIds.has(cancellationId)) {
        resolve(false);
        return;
      }
      const elapsed = Date.now() - start;
      if (elapsed >= ms) {
        resolve(true);
      } else {
        setTimeout(check, Math.min(50, ms - elapsed));
      }
    };
    setTimeout(check, Math.min(50, ms));
  });
}

function collectExports(source: string): string[] {
  const exports: string[] = [];
  const regex = /\bpub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(source))) {
    exports.push(match[1]);
  }
  return Array.from(new Set(exports));
}

function analyzeSource(source: string) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const trimmed = source.trim();

  if (!trimmed) {
    errors.push('Source is empty. Please add Rust source code before compiling.');
  }

  if (/\bfn\s+main\s*\(/.test(source)) {
    errors.push('`fn main` is not allowed in Soroban contract source; use contract entry points instead.');
  }

  if (/\bstd::/.test(source) || /use\s+std::/.test(source)) {
    errors.push('Standard library imports are unavailable in no_std Soroban contracts. Use `soroban_sdk` instead.');
  }

  if (!/use\s+soroban_sdk/.test(source)) {
    warnings.push('No `use soroban_sdk` import was found. Soroban contracts typically require `soroban_sdk` imports.');
  }

  if (!/\#\[\s*contract\s*\]/.test(source)) {
    warnings.push('Missing `#[contract]` attribute above the main contract struct declaration.');
  }

  if (!/\#\[\s*contractimpl\s*\]/.test(source)) {
    warnings.push('Missing `#[contractimpl]` block. Contract functions may not be exported properly without it.');
  }

  const exports = collectExports(source);
  if (exports.length === 0) {
    warnings.push('No exported `pub fn` contract methods were found. Add public functions to expose contract actions.');
  }

  return { errors, warnings, exports };
}

function estimateWasmSizeKb(source: string) {
  return Math.max(4, Math.min(96, Math.ceil(source.length / 200)));
}

async function runCompile(request: CancellableCompileRequest): Promise<void> {
  const { source, filePath, cancellationId } = request;

  const checkCancelled = (): boolean => {
    if (cancelledIds.has(cancellationId)) {
      postCancelled(cancellationId);
      return true;
    }
    return false;
  };

  postLog(cancellationId, 'info', `Starting sandboxed worker compile for ${filePath}`);

  // Enforce strict execution timeout for sandboxed worker.
  const timeoutMs = 3000;
  const timeoutPromise = new Promise<void>((_, reject) => {
    const id = setTimeout(() => {
      reject(new Error('Execution timeout: worker terminated after 3 seconds'));
    }, timeoutMs);
    // Allow cancellation to clear the timer as well.
    cancelledIds.add(cancellationId);
  });

  try {
    await Promise.race([runCompileSandboxed(request), timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Execution timeout')) {
      postLog(cancellationId, 'error', error.message);
      postComplete(cancellationId, {
        success: false,
        warnings: [],
        errors: [error.message],
        exports: [],
        wasmSizeKb: 0,
        durationMs: timeoutMs,
      });
      return;
    }
    throw error;
  }
}

async function runCompileSandboxed(request: CancellableCompileRequest): Promise<void> {
  const { source, filePath, cancellationId } = request;

  if (!(await sleep(200, cancellationId)) || checkCancelled()) return;
  postLog(cancellationId, 'info', 'Resolving Soroban dependencies...');

  if (!(await sleep(250, cancellationId)) || checkCancelled()) return;
  postLog(cancellationId, 'info', 'Checking Rust target wasm32-unknown-unknown...');

  if (!(await sleep(350, cancellationId)) || checkCancelled()) return;
  postLog(cancellationId, 'info', 'Performing static analysis and WebAssembly emission...');

  if (!(await sleep(400, cancellationId)) || checkCancelled()) return;

  const start = performance.now();
  const { errors, warnings, exports } = analyzeSource(source);
  const durationMs = Math.max(120, Math.round(performance.now() - start));
  const wasmSizeKb = estimateWasmSizeKb(source);

  if (checkCancelled()) return;

  if (warnings.length > 0) {
    for (const warning of warnings) {
      postLog(cancellationId, 'info', `Warning: ${warning}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      postLog(cancellationId, 'error', error);
    }
    postLog(cancellationId, 'error', 'Browser compile failed. Review the errors above and try again.');
    postComplete(cancellationId, {
      success: false,
      warnings,
      errors,
      exports,
      wasmSizeKb,
      durationMs,
    });
    return;
  }

  postLog(cancellationId, 'success', `Compilation successful. WASM size: ${wasmSizeKb}KB`);
  postLog(
    cancellationId,
    'success',
    `Contract ready for simulation. Exports: ${exports.length > 0 ? exports.join(', ') : 'none'}.`
  );
  postComplete(cancellationId, {
    success: true,
    warnings,
    errors,
    exports,
    wasmSizeKb,
    durationMs,
  });
}

workerSelf.addEventListener('message', async (event: MessageEvent<CancellableWorkerInbound>) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    cancelledIds.add((msg as WorkerCancelMessage).cancellationId);
    return;
  }

  if (msg.type === 'compile') {
    const request = msg as CancellableCompileRequest;
    try {
      await runCompile(request);
    } catch (error) {
      postLog(
        request.cancellationId,
        'error',
        `Unexpected browser compile error: ${error instanceof Error ? error.message : String(error)}`
      );
      postComplete(request.cancellationId, {
        success: false,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        exports: [],
        wasmSizeKb: 0,
        durationMs: 0,
      });
    }
  }
});

export {};
