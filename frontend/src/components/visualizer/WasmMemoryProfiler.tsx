'use client';

/**
 * WASM contract memory profiler (FE-071).
 *
 * Budget checks + hotspots + three interactive views:
 *  - Flamegraph: shadow-stack bytes (or code size) per call path from each export
 *  - Sunburst:   binary sections / initial linear memory regions
 *  - Growth:     linear memory over execution steps, recorded by running the
 *                exports in a 50 MB-capped worker
 * Every view exports as SVG; the whole report exports as a JSON snapshot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '@/lib/wasmAnalyzer';
import {
  buildBinarySunburst,
  buildFlamegraphTree,
  buildMemoryReport,
  buildMemorySunburst,
  toSnapshotJson,
  traceMemoryGrowth,
  type FlameMetric,
  type GrowthTrace,
  type MemoryReport,
} from '@/lib/wasmMemoryProfiler';
import type { MemoryTraceResponse } from '@/workers/memoryTrace.worker';
import { MemoryFlamegraph } from './MemoryFlamegraph';
import { MemoryGrowthChart } from './MemoryGrowthChart';
import { MemorySunburst } from './MemorySunburst';
import { baseName, downloadFile, serializeSvg } from './svgExport';

type View = 'flamegraph' | 'sunburst' | 'growth';
type SunburstMode = 'memory' | 'binary';

export const TRACE_TIMEOUT_MS = 8_000;

export interface WasmMemoryProfilerProps {
  bytes: Uint8Array;
  fileName?: string;
  /** Injectable for tests; defaults to the memory-trace worker (or inline when Workers are unavailable). */
  runTrace?: (bytes: Uint8Array) => Promise<GrowthTrace>;
}

const SEVERITY_STYLES = {
  critical: 'border-red-600 bg-red-950/30 text-red-300',
  warning: 'border-amber-500 bg-amber-950/20 text-amber-200',
  info: 'border-zinc-700 bg-black text-zinc-300',
  ok: 'border-emerald-700 bg-emerald-950/20 text-emerald-300',
} as const;

/** Run the trace in a worker with a hard timeout; terminate on completion. */
function useTraceRunner(override?: (bytes: Uint8Array) => Promise<GrowthTrace>) {
  const workerRef = useRef<Worker | null>(null);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback(
    (bytes: Uint8Array): Promise<GrowthTrace> => {
      if (override) return override(bytes);
      if (typeof Worker === 'undefined') return traceMemoryGrowth(bytes);

      stop();
      return new Promise<GrowthTrace>((resolve, reject) => {
        const worker = new Worker(new URL('../../workers/memoryTrace.worker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker;
        const timer = setTimeout(() => {
          stop();
          reject(
            new Error(
              `Execution did not finish within ${TRACE_TIMEOUT_MS / 1000}s — an export probably loops without calling the host. The trace worker was stopped.`
            )
          );
        }, TRACE_TIMEOUT_MS);
        worker.onmessage = (event: MessageEvent<MemoryTraceResponse>) => {
          clearTimeout(timer);
          stop();
          if (event.data.ok) resolve(event.data.trace);
          else reject(new Error(event.data.error));
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          stop();
          reject(new Error(event.message || 'The trace worker crashed (possibly out of memory).'));
        };
        const copy = bytes.slice().buffer as ArrayBuffer;
        worker.postMessage({ id: 1, bytes: copy }, [copy]);
      });
    },
    [override, stop]
  );

  return { run, stop };
}

export function WasmMemoryProfiler({ bytes, fileName, runTrace }: WasmMemoryProfilerProps) {
  const report: MemoryReport = useMemo(() => buildMemoryReport(bytes), [bytes]);
  const [view, setView] = useState<View>('flamegraph');
  const defaultMetric: FlameMetric = report.functions.some((f) => f.shadowStackBytes > 0) ? 'stack' : 'code';
  const [metric, setMetric] = useState<FlameMetric>(defaultMetric);
  const [sunburstMode, setSunburstMode] = useState<SunburstMode>('memory');
  const [selectedFunction, setSelectedFunction] = useState<number | undefined>();
  const [trace, setTrace] = useState<GrowthTrace | null>(null);
  const [traceState, setTraceState] = useState<'idle' | 'running' | 'error'>('idle');
  const [traceError, setTraceError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { run, stop } = useTraceRunner(runTrace);

  // New module → reset everything derived from the previous one.
  useEffect(() => {
    stop();
    setTrace(null);
    setTraceState('idle');
    setTraceError(null);
    setSelectedFunction(undefined);
    setMetric(report.functions.some((f) => f.shadowStackBytes > 0) ? 'stack' : 'code');
  }, [report, stop]);

  const flameTree = useMemo(() => buildFlamegraphTree(report, metric), [report, metric]);
  const sunburstTree = useMemo(
    () => (sunburstMode === 'memory' ? buildMemorySunburst(report) : buildBinarySunburst(bytes, report)),
    [bytes, report, sunburstMode]
  );

  const startTrace = async () => {
    setTraceState('running');
    setTraceError(null);
    try {
      setTrace(await run(bytes));
      setTraceState('idle');
    } catch (err) {
      setTraceError(err instanceof Error ? err.message : String(err));
      setTraceState('error');
    }
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const suffix = view === 'sunburst' ? `sunburst-${sunburstMode}` : view === 'flamegraph' ? `flamegraph-${metric}` : 'growth';
    downloadFile(`${baseName(fileName)}-${suffix}.svg`, serializeSvg(svgRef.current), 'image/svg+xml');
  };

  const exportJson = () => {
    downloadFile(
      `${baseName(fileName)}-memory-profile.json`,
      toSnapshotJson(report, { fileName, trace: trace ?? undefined }),
      'application/json'
    );
  };

  if (!report.module.valid) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <h2 className="mb-2 text-xs tracking-widest text-zinc-400 uppercase">Memory profiler</h2>
        <p className="text-sm text-zinc-500">Cannot profile this module: {report.module.error}</p>
      </section>
    );
  }

  const selected = selectedFunction !== undefined ? report.functions[selectedFunction] : undefined;
  const canExportSvg = view !== 'growth' || !!trace;

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6" aria-labelledby="memory-profiler-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="memory-profiler-heading" className="text-xs tracking-widest text-zinc-400 uppercase">
          Memory profiler · flamegraph & heap visualization
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportSvg}
            disabled={!canExportSvg}
            className="rounded border border-white/10 px-3 py-1 text-[11px] tracking-widest text-zinc-300 uppercase hover:border-red-500 disabled:opacity-40"
          >
            Export SVG
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="rounded border border-white/10 px-3 py-1 text-[11px] tracking-widest text-zinc-300 uppercase hover:border-red-500"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Budgets */}
      <ul className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Memory budgets">
        {report.budgets.map((b) => (
          <li
            key={b.id}
            data-testid={`budget-${b.id}`}
            data-status={b.status}
            className={`rounded border-l-2 p-3 text-xs ${SEVERITY_STYLES[b.status]}`}
          >
            <p className="font-semibold">
              {b.label}:{' '}
              {Number.isFinite(b.bytes) ? formatBytes(b.bytes) : b.id === 'max-memory' ? 'unbounded' : 'unbounded (recursion)'}
              <span className="ml-2 text-[10px] uppercase opacity-70">{b.status}</span>
            </p>
            <p className="mt-1 text-[11px] opacity-80">{b.message}</p>
          </li>
        ))}
      </ul>

      {/* View switcher */}
      <div role="tablist" aria-label="Profiler views" className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['flamegraph', 'Flamegraph'],
            ['sunburst', 'Sunburst'],
            ['growth', 'Memory growth'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`rounded px-3 py-1 text-[11px] tracking-widest uppercase ${
              view === id ? 'bg-red-600 text-white' : 'bg-black text-zinc-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="rounded border border-white/10 bg-black p-3">
        {view === 'flamegraph' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
              <label className="flex items-center gap-2">
                Weight
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as FlameMetric)}
                  className="rounded border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-white"
                >
                  <option value="stack">Shadow-stack bytes</option>
                  <option value="code">Code size</option>
                </select>
              </label>
              <span>Click a bar to zoom · red = hotspot · amber = recursion</span>
            </div>
            <MemoryFlamegraph
              ref={svgRef}
              data={flameTree}
              unitLabel={metric === 'stack' ? 'shadow-stack bytes' : 'code size'}
              selectedFunction={selectedFunction}
              onSelectFunction={setSelectedFunction}
            />
          </>
        )}

        {view === 'sunburst' && (
          <>
            <div className="mb-3 flex items-center gap-3 text-[11px] text-zinc-400">
              <label className="flex items-center gap-2">
                Breakdown
                <select
                  value={sunburstMode}
                  onChange={(e) => setSunburstMode(e.target.value as SunburstMode)}
                  className="rounded border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-white"
                >
                  <option value="memory">Initial linear memory</option>
                  <option value="binary">Binary sections</option>
                </select>
              </label>
              <span>Click a segment to zoom · centre to zoom out</span>
            </div>
            <div className="flex justify-center">
              <MemorySunburst ref={svgRef} data={sunburstTree} onSelectFunction={setSelectedFunction} />
            </div>
          </>
        )}

        {view === 'growth' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startTrace()}
                disabled={traceState === 'running'}
                className="rounded bg-red-600 px-3 py-1.5 text-[11px] font-bold tracking-widest text-white uppercase hover:bg-red-500 disabled:opacity-50"
              >
                {traceState === 'running' ? 'Executing…' : trace ? 'Re-run trace' : 'Run execution trace'}
              </button>
              <p className="text-[11px] text-zinc-500">
                Runs each export in a sandboxed worker capped at 50 MB. Host functions are stubbed, so
                results approximate on-chain behaviour.
              </p>
            </div>
            {traceError && (
              <p role="alert" className="rounded border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                {traceError}
              </p>
            )}
            {trace && (
              <>
                <MemoryGrowthChart ref={svgRef} trace={trace} />
                <ul className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                  {trace.exports.map((e) => (
                    <li key={e.exportName} className="rounded border border-white/10 p-2 text-zinc-400">
                      <span className="font-mono text-zinc-200">{e.exportName}</span> · peak{' '}
                      {formatBytes(e.peakBytes)} · {e.hostCalls} host call(s)
                      {e.diagnostic && <span className="block text-amber-300">{e.diagnostic.message}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-3 rounded border border-white/10 bg-black p-3 text-[11px] text-zinc-400" data-testid="selected-function">
          <span className="font-mono text-zinc-100">{selected.name}</span> · frame {formatBytes(selected.shadowStackBytes)} ·
          locals {formatBytes(selected.localsBytes)} · code {formatBytes(selected.codeBytes)} · {selected.loadCount} loads /{' '}
          {selected.storeCount} stores
          {selected.memoryGrowSites > 0 && ` · ${selected.memoryGrowSites} memory.grow`}
        </div>
      )}

      {/* Hotspots */}
      <div className="mt-6">
        <h3 className="mb-3 text-[11px] tracking-widest text-zinc-400 uppercase">
          Memory hotspots ({report.hotspots.length})
        </h3>
        {report.hotspots.length === 0 ? (
          <p className="text-xs text-zinc-500">No hotspots detected.</p>
        ) : (
          <ul className="space-y-2" aria-label="Memory hotspots">
            {report.hotspots.map((h, i) => (
              <li key={`${h.kind}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (h.functionIndex !== undefined) {
                      setSelectedFunction(h.functionIndex);
                      setView('flamegraph');
                    }
                  }}
                  className={`w-full rounded border-l-2 p-3 text-left text-xs ${SEVERITY_STYLES[h.severity]}`}
                >
                  <span className="font-semibold">{h.title}</span>
                  {h.bytes !== undefined && <span className="ml-2 opacity-80">{formatBytes(h.bytes)}</span>}
                  <span className="mt-1 block text-[11px] opacity-80">{h.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default WasmMemoryProfiler;
