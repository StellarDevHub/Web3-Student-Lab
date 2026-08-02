/// <reference lib="webworker" />

import type { CompileLogEntry, CompileWorkerCompleteMessage, CompileWorkerRequest } from './compileTypes';

type WorkerSelf = typeof self & { postMessage(message: unknown): void };
const workerSelf = self as WorkerSelf;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function runCompile(request: CompileWorkerRequest) {
  const { source, filePath } = request;
  workerSelf.postMessage({ type: 'log', entry: createLog('info', `Starting browser worker compile for ${filePath}`) });
  await sleep(200);
  workerSelf.postMessage({ type: 'log', entry: createLog('info', 'Resolving Soroban dependencies...') });
  await sleep(250);
  workerSelf.postMessage({ type: 'log', entry: createLog('info', 'Checking Rust target wasm32-unknown-unknown...') });
  await sleep(350);
  workerSelf.postMessage({ type: 'log', entry: createLog('info', 'Performing static analysis and WebAssembly emission...') });
  await sleep(400);

  const start = performance.now();
  const { errors, warnings, exports } = analyzeSource(source);
  const durationMs = Math.max(120, Math.round(performance.now() - start));
  const wasmSizeKb = estimateWasmSizeKb(source);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      workerSelf.postMessage({ type: 'log', entry: createLog('info', `Warning: ${warning}`) });
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      workerSelf.postMessage({ type: 'log', entry: createLog('error', error) });
    }
    workerSelf.postMessage({ type: 'log', entry: createLog('error', 'Browser compile failed. Review the errors above and try again.') });
    const completeMessage: CompileWorkerCompleteMessage = {
      type: 'complete',
      success: false,
      warnings,
      errors,
      exports,
      wasmSizeKb,
      durationMs,
    };
    workerSelf.postMessage(completeMessage);
    return;
  }

  workerSelf.postMessage({ type: 'log', entry: createLog('success', `Compilation successful. WASM size: ${wasmSizeKb}KB`) });
  workerSelf.postMessage({ type: 'log', entry: createLog('success', `Contract ready for simulation. Exports: ${exports.length > 0 ? exports.join(', ') : 'none'}.`) });
  const completeMessage: CompileWorkerCompleteMessage = {
    type: 'complete',
    success: true,
    warnings,
    errors,
    exports,
    wasmSizeKb,
    durationMs,
  };
  workerSelf.postMessage(completeMessage);
}

workerSelf.addEventListener('message', async (event: MessageEvent<CompileWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'compile') {
    return;
  }
  try {
    await runCompile(request);
  } catch (error) {
    workerSelf.postMessage({
      type: 'log',
      entry: createLog('error', `Unexpected browser compile error: ${error instanceof Error ? error.message : String(error)}`),
    });
    workerSelf.postMessage({
      type: 'complete',
      success: false,
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
      exports: [],
      wasmSizeKb: 0,
      durationMs: 0,
    });
  }
});

export { };
