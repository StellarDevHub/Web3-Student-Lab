'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Bug, ChevronLeft, ChevronRight, Play, RotateCcw, Upload } from 'lucide-react';

import {
  WasmOpcodeStepper,
  type VmValue,
  type WasmVmState,
} from '@/lib/debugger/WasmOpcodeStepper';
import {
  createDemoModule,
  disassembleWasm,
  type InstructionCategory,
  type WasmDisassembly,
  type WasmFunction,
} from '@/lib/debugger/wasmDisassembler';

const CATEGORY_STYLES: Record<InstructionCategory, string> = {
  control: 'text-red-400',
  call: 'text-amber-300',
  const: 'text-emerald-300',
  variable: 'text-sky-300',
  memory: 'text-violet-300',
  numeric: 'text-zinc-200',
  reference: 'text-pink-300',
  other: 'text-zinc-400',
};

interface DebuggerSession {
  fileName: string;
  disassembly: WasmDisassembly;
  stepper: WasmOpcodeStepper;
  vmState: WasmVmState;
  selectedFunction: number;
}

function firstSteppableFunction(disassembly: WasmDisassembly): number {
  const steppable = disassembly.functions.filter(
    (fn) => !fn.imported && fn.instructions.length > 0
  );
  return (
    steppable.find((fn) => fn.exportNames.includes('main'))?.index ??
    steppable.find((fn) => fn.exportNames.length > 0)?.index ??
    steppable[0]?.index ??
    disassembly.functions[0]?.index ??
    0
  );
}

function createSession(bytes: Uint8Array, fileName: string): DebuggerSession {
  const disassembly = disassembleWasm(bytes);
  const selectedFunction = firstSteppableFunction(disassembly);
  const stepper = new WasmOpcodeStepper(disassembly, selectedFunction);
  return {
    fileName,
    disassembly,
    stepper,
    vmState: stepper.state,
    selectedFunction,
  };
}

function formatValue(value: VmValue): string {
  if (value.value === null) return '?';
  if (typeof value.value === 'bigint') return `${value.value}n`;
  if (typeof value.value === 'number') {
    return Number.isInteger(value.value) ? String(value.value) : value.value.toPrecision(7);
  }
  return value.value;
}

function offsetLabel(offset: number): string {
  return `0x${offset.toString(16).padStart(6, '0')}`;
}

function StatusBadge({ status }: { status: WasmVmState['status'] }) {
  const styles =
    status === 'trapped'
      ? 'border-red-500/40 bg-red-500/10 text-red-400'
      : status === 'finished'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest uppercase ${styles}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status === 'ready' ? 'Paused' : status}
    </span>
  );
}

function FunctionTab({
  fn,
  active,
  onSelect,
}: {
  fn: WasmFunction;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-red-500/40 bg-red-500/10 text-white'
          : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
      }`}
    >
      <span className="font-mono text-[11px]">{fn.name}</span>
      {fn.imported ? (
        <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-bold tracking-wide text-amber-300 uppercase">
          import
        </span>
      ) : (
        <span className="text-[9px] text-zinc-500">{fn.instructions.length} ops</span>
      )}
    </button>
  );
}

export function DisassemblerPane({ className = '' }: { className?: string }) {
  const [session, setSession] = useState<DebuggerSession>(() =>
    createSession(createDemoModule(), 'demo-add.wasm')
  );
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  const { disassembly, vmState, stepper, selectedFunction, fileName } = session;
  const topFrame = vmState.frames[vmState.frames.length - 1];
  const activeFunction =
    disassembly.functions.find((fn) => fn.index === topFrame?.functionIndex) ??
    disassembly.functions.find((fn) => fn.index === selectedFunction);
  const currentInstruction = activeFunction
    ? activeFunction.instructions[topFrame?.pc ?? -1]
    : undefined;

  useEffect(() => {
    currentRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [vmState.executed, vmState.frames.length, activeFunction?.index]);

  const loadBytes = useCallback((bytes: Uint8Array, name: string) => {
    const next = createSession(bytes, name);
    if (!next.disassembly.valid) {
      setLoadError(
        next.disassembly.error ??
          'This binary could not be disassembled. Check that it is a compiled .wasm module.'
      );
      return;
    }
    setLoadError(null);
    setBreakpoints(new Set());
    setSession(next);
  }, []);

  const readFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        loadBytes(new Uint8Array(buffer), file.name);
      } catch {
        setLoadError(`Could not read ${file.name}.`);
      }
    },
    [loadBytes]
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const selectFunction = (index: number) => {
    const nextState = stepper.reset(index);
    setSession((prev) => ({ ...prev, selectedFunction: index, vmState: nextState }));
  };

  const step = (direction: 'back' | 'forward') => {
    const nextState = direction === 'back' ? stepper.stepBackward() : stepper.stepForward();
    setSession((prev) => ({ ...prev, vmState: nextState }));
  };

  const runToBreakpoint = () => {
    const nextState = stepper.runToBreakpoint(breakpoints);
    setSession((prev) => ({ ...prev, vmState: nextState }));
  };

  const reset = () => {
    const nextState = stepper.reset(selectedFunction);
    setSession((prev) => ({ ...prev, vmState: nextState }));
  };

  const toggleBreakpoint = (offset: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(offset)) next.delete(offset);
      else next.add(offset);
      return next;
    });
  };

  const loadDemo = () => {
    setBreakpoints(new Set());
    setLoadError(null);
    setSession(createSession(createDemoModule(), 'demo-add.wasm'));
  };

  const isLoading = !disassembly.valid;

  return (
    <div
      className={`relative rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl sm:p-8 ${className}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      data-testid="disassembler-pane"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black tracking-widest text-white uppercase">
            <Bug className="h-5 w-5 text-red-500" />
            WASM Opcode Debugger
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Disassemble a compiled Soroban contract in the browser, set breakpoints on byte offsets,
            and step the operand stack forwards or backwards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".wasm,application/wasm"
            className="sr-only"
            onChange={onFileChange}
            aria-label="Upload a WebAssembly module"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-zinc-200 uppercase transition-colors hover:border-red-500/40 hover:text-white"
          >
            <Upload className="h-3.5 w-3.5" /> Load .wasm
          </button>
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase transition-colors hover:border-white/25 hover:text-white"
          >
            Demo contract
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
        <span className="normal-case text-zinc-300">{fileName}</span>
        <span>{disassembly.totalBytes} bytes</span>
        <span>{disassembly.totalInstructions} instructions</span>
        <span>{disassembly.functions.length} functions</span>
        {breakpoints.size > 0 && (
          <span className="text-red-400">{breakpoints.size} breakpoints</span>
        )}
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300"
        >
          {loadError}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/30 text-center">
          <Upload className="mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
            Drop a .wasm file here
          </p>
          <p className="mt-1 max-w-sm text-[11px] text-zinc-600">
            Compiled Soroban contracts work best. Nothing leaves this page — decoding happens
            entirely in your browser.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {disassembly.functions.map((fn) => (
              <FunctionTab
                key={fn.index}
                fn={fn}
                active={fn.index === activeFunction?.index}
                onSelect={() => selectFunction(fn.index)}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
            <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">
                  {activeFunction?.name ?? 'No function'} · instruction listing
                </span>
                <span className="font-mono text-[10px] text-zinc-600">
                  {activeFunction?.bodySize ?? 0} byte body
                </span>
              </div>

              <div className="max-h-[540px] overflow-auto font-mono text-[11px]" role="list">
                {activeFunction?.instructions.length ? (
                  activeFunction.instructions.map((instruction) => {
                    const isCurrent =
                      currentInstruction?.offset === instruction.offset &&
                      topFrame?.functionIndex === activeFunction.index;
                    const hasBreakpoint = breakpoints.has(instruction.offset);

                    return (
                      <div
                        key={`${instruction.offset}-${instruction.index}`}
                        ref={isCurrent ? currentRowRef : undefined}
                        role="listitem"
                        className={`group flex items-start gap-2 border-b border-white/[0.03] px-2 py-1 transition-colors ${
                          isCurrent ? 'bg-red-500/10 text-white' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleBreakpoint(instruction.offset)}
                          aria-label={`${hasBreakpoint ? 'Remove' : 'Set'} breakpoint at ${offsetLabel(instruction.offset)}`}
                          aria-pressed={hasBreakpoint}
                          className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                        >
                          <span
                            className={`h-2 w-2 rounded-full transition-colors ${
                              hasBreakpoint ? 'bg-red-500' : 'bg-zinc-700 group-hover:bg-red-500/50'
                            }`}
                          />
                        </button>
                        <span className="w-[74px] flex-shrink-0 text-[10px] text-zinc-600">
                          {offsetLabel(instruction.offset)}
                        </span>
                        <span className="w-5 flex-shrink-0 text-right text-[10px] text-zinc-700">
                          {instruction.index + 1}
                        </span>
                        <span
                          className="min-w-0 flex-1 whitespace-pre"
                          style={{ paddingLeft: `${instruction.depth * 14}px` }}
                        >
                          <span className={CATEGORY_STYLES[instruction.category]}>
                            {instruction.mnemonic}
                          </span>
                          {instruction.immediates && (
                            <span className="text-zinc-500"> {instruction.immediates}</span>
                          )}
                        </span>
                        {isCurrent && (
                          <span className="mt-0.5 flex-shrink-0 rounded bg-red-500 px-1.5 text-[8px] font-black tracking-wide text-white uppercase">
                            pc
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="px-4 py-8 text-center text-[11px] text-zinc-600">
                    This function has no body — it is imported from the Soroban host.
                  </p>
                )}
              </div>
            </div>

            <aside className="flex min-w-0 flex-col gap-3">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <StatusBadge status={vmState.status} />
                  <span className="font-mono text-[10px] text-zinc-600">
                    {vmState.executed} executed
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => step('back')}
                    disabled={!stepper.canStepBackward}
                    aria-label="Step backwards"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-black tracking-widest text-zinc-200 uppercase transition-colors hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => step('forward')}
                    disabled={!stepper.canStepForward}
                    aria-label="Step forwards"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-[10px] font-black tracking-widest text-red-300 uppercase transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Step <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={runToBreakpoint}
                    disabled={vmState.status !== 'ready' || breakpoints.size === 0}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-black tracking-widest text-zinc-200 uppercase transition-colors hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Play className="h-3.5 w-3.5" /> Run to bp
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase transition-colors hover:border-white/25 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                </div>

                {vmState.note && (
                  <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
                    {vmState.note}
                  </p>
                )}
              </div>

              <InspectorSection title={`Call stack (${vmState.frames.length})`}>
                {vmState.frames.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">Execution has finished.</p>
                ) : (
                  [...vmState.frames].reverse().map((frame, reversedIndex) => {
                    const depth = vmState.frames.length - 1 - reversedIndex;
                    return (
                      <div
                        key={`${frame.functionIndex}-${depth}`}
                        className={`rounded-lg border px-2 py-1.5 ${
                          depth === vmState.frames.length - 1
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-white/5 bg-black/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[11px] text-zinc-300">
                            #{depth} {frame.functionName}
                          </span>
                          <span className="flex-shrink-0 font-mono text-[9px] text-zinc-600">
                            pc {frame.pc}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </InspectorSection>

              <InspectorSection title={`Locals${topFrame ? ` · ${topFrame.functionName}` : ''}`}>
                {!topFrame || topFrame.locals.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">No locals in this frame.</p>
                ) : (
                  topFrame.locals.map((local) => (
                    <div
                      key={local.index}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/30 px-2 py-1 font-mono text-[10px]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="rounded bg-sky-500/10 px-1 text-[8px] text-sky-300">
                          {local.type}
                        </span>
                        <span className="truncate text-zinc-400">{local.name}</span>
                        <span className="text-zinc-700">[{local.index}]</span>
                      </span>
                      <span className="flex-shrink-0 text-emerald-300">
                        {formatValue(local.value)}
                      </span>
                    </div>
                  ))
                )}
              </InspectorSection>

              <InspectorSection title={`Operand stack (${topFrame?.stack.length ?? 0})`}>
                {!topFrame || topFrame.stack.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">Stack is empty.</p>
                ) : (
                  [...topFrame.stack].reverse().map((value, reversedIndex) => (
                    <div
                      key={`${reversedIndex}-${formatValue(value)}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/30 px-2 py-1 font-mono text-[10px]"
                    >
                      <span className="text-zinc-600">
                        {reversedIndex === 0 ? 'top' : `-${reversedIndex}`}
                      </span>
                      <span className="text-zinc-500">{value.type}</span>
                      <span className="text-amber-300">{formatValue(value)}</span>
                    </div>
                  ))
                )}
              </InspectorSection>

              <InspectorSection title={`Breakpoints (${breakpoints.size})`}>
                {breakpoints.size === 0 ? (
                  <p className="text-[11px] leading-relaxed text-zinc-600">
                    Click the dot beside any instruction offset to pause there.
                  </p>
                ) : (
                  Array.from(breakpoints)
                    .sort((a, b) => a - b)
                    .map((offset) => (
                      <div
                        key={offset}
                        className="flex items-center justify-between rounded-lg border border-red-500/15 bg-red-500/5 px-2 py-1 font-mono text-[10px]"
                      >
                        <span className="text-red-300">{offsetLabel(offset)}</span>
                        <button
                          type="button"
                          onClick={() => toggleBreakpoint(offset)}
                          aria-label={`Remove breakpoint at ${offsetLabel(offset)}`}
                          className="text-red-400/60 transition-colors hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                )}
              </InspectorSection>
            </aside>
          </div>

          {disassembly.warnings.length > 0 && (
            <details className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <summary className="cursor-pointer text-[10px] font-black tracking-widest text-amber-300 uppercase">
                {disassembly.warnings.length} decoder warning
                {disassembly.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 text-[10px] text-amber-200/70">
                {disassembly.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-dashed border-red-500/60 bg-red-500/5" />
      )}
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <p className="mb-2 text-[9px] font-black tracking-widest text-zinc-500 uppercase">{title}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto">{children}</div>
    </div>
  );
}
