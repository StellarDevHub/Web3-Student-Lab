import * as monaco from 'monaco-editor';

let rustfmtWasmModule: WebAssembly.Module | null = null;
let rustfmtWasmInstance: WebAssembly.Instance | null = null;
let rustfmtInitialized = false;
let rustfmtInitPromise: Promise<void> | null = null;

const RUSTFMT_WASM_URL = '/rustfmt.wasm';

interface RustfmtExports {
  memory: WebAssembly.Memory;
  rustfmt_format: (inputPtr: number, inputLen: number) => number;
  alloc: (size: number) => number;
  dealloc: (ptr: number, size: number) => void;
}

function getRustfmtExports(): RustfmtExports | null {
  if (!rustfmtWasmInstance) return null;
  return rustfmtWasmInstance.exports as unknown as RustfmtExports;
}

async function loadRustfmtWasm(): Promise<void> {
  if (rustfmtInitialized) return;
  if (rustfmtInitPromise) return rustfmtInitPromise;

  rustfmtInitPromise = (async () => {
    try {
      const response = await fetch(RUSTFMT_WASM_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch rustfmt.wasm: ${response.status}`);
      }
      const wasmBytes = await response.arrayBuffer();
      rustfmtWasmModule = await WebAssembly.compile(wasmBytes);
      
      const memory = new WebAssembly.Memory({ initial: 10, maximum: 100 });
      
      const imports = {
        env: {
          memory,
          abort: () => { throw new Error('WASM abort'); },
        },
      };
      
      rustfmtWasmInstance = await WebAssembly.instantiate(rustfmtWasmModule, imports);
      rustfmtInitialized = true;
    } catch (error) {
      console.warn('Failed to load rustfmt WASM, using JS fallback:', error);
      rustfmtInitialized = false;
    }
  })();

  return rustfmtInitPromise;
}

function formatWithRustfmtWasm(source: string): string | null {
  const exports = getRustfmtExports();
  if (!exports) return null;

  try {
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(source);
    const inputLen = inputBytes.length;

    const inputPtr = exports.alloc(inputLen + 1);
    if (inputPtr === 0) return null;

    const memory = new Uint8Array(exports.memory.buffer);
    memory.set(inputBytes, inputPtr);
    memory[inputPtr + inputLen] = 0;

    const resultPtr = exports.rustfmt_format(inputPtr, inputLen);
    
    exports.dealloc(inputPtr, inputLen + 1);
    
    if (resultPtr === 0) return null;

    const resultLenView = new DataView(exports.memory.buffer, resultPtr, 4);
    const resultLen = resultLenView.getUint32(0, true);
    const resultDataPtr = resultPtr + 4;

    if (resultLen === 0) {
      exports.dealloc(resultPtr, 4);
      return source;
    }

    const resultBytes = new Uint8Array(exports.memory.buffer, resultDataPtr, resultLen);
    const result = new TextDecoder().decode(resultBytes);
    
    exports.dealloc(resultPtr, 4 + resultLen);
    
    return result;
  } catch (error) {
    console.warn('rustfmt WASM formatting failed:', error);
    return null;
  }
}

function formatWithJsFallback(source: string): string {
  const lines = source.split('\n');
  const result: string[] = [];
  let indentLevel = 0;
  const indentSize = 4;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed === '') {
      result.push('');
      continue;
    }
    
    const startsWithCloseBrace = trimmed.startsWith('}');
    const startsWithElse = trimmed.startsWith('else');
    const startsWithCatch = trimmed.startsWith('catch');
    const startsWithFinally = trimmed.startsWith('finally');
    const startsWithWhile = trimmed.startsWith('while');
    
    if (startsWithCloseBrace || startsWithElse || startsWithCatch || startsWithFinally || startsWithWhile) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    const indent = ' '.repeat(indentLevel * indentSize);
    result.push(indent + trimmed);
    
    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;
    const netBraces = openBraces - closeBraces;
    
    if (netBraces > 0) {
      indentLevel += netBraces;
    } else if (netBraces < 0) {
      indentLevel = Math.max(0, indentLevel + netBraces);
    }
    
    const endsWithOpenBrace = trimmed.endsWith('{') && !trimmed.endsWith('{}');
    const isControlFlow = /^\s*(if|else|for|while|match|fn|impl|mod|struct|enum|trait|const|static|let|loop)\b/.test(trimmed);
    
    if (endsWithOpenBrace || (isControlFlow && !trimmed.includes('{'))) {
    }
  }
  
  return result.join('\n');
}

export function formatSorobanSource(source: string): string {
  if (rustfmtInitialized) {
    const wasmResult = formatWithRustfmtWasm(source);
    if (wasmResult !== null) {
      return wasmResult;
    }
  }
  
  return formatWithJsFallback(source);
}

export function registerSorobanDocumentFormattingEditProvider(monacoApi: typeof monaco) {
  monacoApi.languages.registerDocumentFormattingEditProvider('soroban-rust', {
    async provideDocumentFormattingEdits(model, _options, _token) {
      const source = model.getValue();
      const formatted = formatSorobanSource(source);
      
      if (formatted === source) {
        return [];
      }

      const fullRange = model.getFullModelRange();
      return [{
        range: fullRange,
        text: formatted,
      }];
    },
  });
}

export async function initializeRustfmtWasm(): Promise<void> {
  await loadRustfmtWasm();
}

export function isRustfmtReady(): boolean {
  return rustfmtInitialized;
}