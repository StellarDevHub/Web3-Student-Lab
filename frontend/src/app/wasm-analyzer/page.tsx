'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  WasmModuleInfo,
  analyzeWasm,
  formatBytes,
  groupHostFunctions,
  optimizationHints,
  sectionBreakdown,
} from '@/lib/wasmAnalyzer';
import type { WatResponse } from '@/workers/wat.worker';

/**
 * Soroban WASM disassembler and analyzer (Issue #1160).
 *
 * Drop in a compiled contract and read its structure without a local
 * toolchain: section headers, the host functions it imports, where its bytes
 * went, and what could be trimmed. WAT disassembly runs in a worker because
 * wabt is heavy; the structural analysis is synchronous and lands immediately.
 */
export default function WasmAnalyzerPage() {
  const [info, setInfo] = useState<WasmModuleInfo | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [wat, setWat] = useState<string>('');
  const [watError, setWatError] = useState<string | null>(null);
  const [disassembling, setDisassembling] = useState(false);
  const [search, setSearch] = useState('');

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    return () => {
      // A worker outlives the page unless it is told not to.
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const disassemble = useCallback((bytes: ArrayBuffer) => {
    setDisassembling(true);
    setWat('');
    setWatError(null);

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../../workers/wat.worker.ts', import.meta.url));
    }

    const worker = workerRef.current;
    const id = ++requestId.current;

    const onMessage = (event: MessageEvent<WatResponse>) => {
      // Ignore anything from a file the student has already replaced.
      if (event.data.id !== requestId.current) return;
      worker.removeEventListener('message', onMessage);
      setDisassembling(false);

      if (event.data.ok) setWat(event.data.wat);
      else setWatError(event.data.error);
    };

    worker.addEventListener('message', onMessage);
    // The buffer is transferred, not copied — a contract can be megabytes.
    worker.postMessage({ id, bytes }, [bytes]);
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();

      // Analyse before transferring the buffer to the worker, which neuters it.
      setInfo(analyzeWasm(new Uint8Array(buffer.slice(0))));
      disassemble(buffer);
    },
    [disassemble],
  );

  const breakdown = useMemo(() => (info ? sectionBreakdown(info) : []), [info]);
  const hints = useMemo(() => (info ? optimizationHints(info) : []), [info]);
  const hostGroups = useMemo(
    () => (info ? groupHostFunctions(info.hostFunctions) : {}),
    [info],
  );

  const watLines = useMemo(() => {
    if (!wat) return [];
    const lines = wat.split('\n');
    if (!search.trim()) return lines.map((line, i) => ({ line, i, match: false }));

    const needle = search.toLowerCase();
    return lines.map((line, i) => ({ line, i, match: line.toLowerCase().includes(needle) }));
  }, [wat, search]);

  const matchCount = watLines.filter((l) => l.match).length;

  return (
    <div className="relative min-h-[calc(100vh-80px)] bg-black p-6 font-mono text-white md:p-12">
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-8 border-l-4 border-red-600 pl-6">
          <h1 className="mb-2 text-3xl font-black tracking-tighter uppercase sm:text-4xl">
            WASM <span className="text-red-500">Analyzer</span>
          </h1>
          <p className="text-xs tracking-widest text-zinc-500 uppercase">
            Soroban bytecode disassembler & optimization inspector
          </p>
        </div>

        {/* File input */}
        <label className="mb-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 px-6 py-10 text-center transition hover:border-red-500/50">
          <span className="text-xs tracking-widest text-zinc-400 uppercase">
            {fileName || 'Select a .wasm contract'}
          </span>
          <span className="mt-2 text-[10px] text-zinc-600">
            Parsed entirely in your browser — nothing is uploaded
          </span>
          <input
            type="file"
            accept=".wasm,application/wasm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>

        {info && !info.valid && (
          <div className="mb-8 rounded-2xl border border-red-600/40 bg-red-950/20 p-6">
            <p className="text-xs tracking-widest text-red-400 uppercase">Cannot parse module</p>
            <p className="mt-2 text-sm text-zinc-300">{info.error}</p>
          </div>
        )}

        {info?.valid && (
          <div className="space-y-8">
            {/* Summary */}
            <section className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-zinc-950 p-6 md:grid-cols-4">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Size</p>
                <p className="font-mono text-xl">{formatBytes(info.totalBytes)}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Sections</p>
                <p className="font-mono text-xl">{info.sections.length}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Host imports</p>
                <p className="font-mono text-xl text-amber-400">{info.hostFunctions.length}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Exports</p>
                <p className="font-mono text-xl">{info.exports.length}</p>
              </div>
            </section>

            {/* Sections */}
            <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
              <h2 className="mb-4 text-xs tracking-widest text-zinc-400 uppercase">
                Section headers
              </h2>
              <ul className="space-y-2">
                {breakdown.map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 truncate text-xs text-zinc-300">{s.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-black">
                      <span
                        className="block h-full bg-red-600"
                        style={{ width: `${Math.max(1, s.share * 100)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-zinc-400">
                      {formatBytes(s.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Host functions */}
            {info.hostFunctions.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
                <h2 className="mb-4 text-xs tracking-widest text-zinc-400 uppercase">
                  Soroban host functions
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(hostGroups).map(([group, fns]) => (
                    <div key={group} className="rounded border border-white/10 bg-black p-3">
                      <p className="mb-2 text-[10px] tracking-widest text-amber-400 uppercase">
                        {group} · {fns.length}
                      </p>
                      <ul className="space-y-1">
                        {fns.map((fn) => (
                          <li key={`${fn.module}.${fn.field}`} className="text-[11px] text-zinc-400">
                            env.{fn.field}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Optimization hints */}
            {hints.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
                <h2 className="mb-4 text-xs tracking-widest text-zinc-400 uppercase">
                  Optimization opportunities
                </h2>
                <ul className="space-y-3">
                  {hints.map((hint) => (
                    <li
                      key={hint.title}
                      className={`rounded border-l-2 bg-black p-3 ${hint.severity === 'warning' ? 'border-amber-500' : 'border-zinc-700'}`}
                    >
                      <p className="text-xs text-white">
                        {hint.title}
                        {hint.estimatedSaving !== undefined && (
                          <span className="ml-2 text-amber-400">
                            −{formatBytes(hint.estimatedSaving)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">{hint.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* WAT viewer */}
            <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xs tracking-widest text-zinc-400 uppercase">
                  WebAssembly text format
                </h2>
                {wat && (
                  <label className="flex items-center gap-2 text-[10px] tracking-widest text-zinc-500 uppercase">
                    Search
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs text-white"
                      placeholder="call, storage…"
                    />
                    {search && <span className="text-amber-400">{matchCount}</span>}
                  </label>
                )}
              </div>

              {disassembling && (
                <p className="text-xs text-zinc-500">Disassembling in a worker…</p>
              )}

              {watError && (
                <p className="rounded border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                  {watError}
                </p>
              )}

              {wat && (
                <pre className="max-h-[28rem] overflow-auto rounded bg-black p-4 text-[11px] leading-relaxed">
                  {watLines.map(({ line, i, match }) => (
                    <div
                      key={i}
                      className={match ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400'}
                    >
                      <span className="mr-3 inline-block w-10 shrink-0 text-right text-zinc-700">
                        {i + 1}
                      </span>
                      {line}
                    </div>
                  ))}
                </pre>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
