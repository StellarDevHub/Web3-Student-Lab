'use client';

/**
 * The only door to heavy visualization components (FE-076).
 *
 * Every component here pulls in d3, chart.js, recharts or other charting
 * code. Routes import these `next/dynamic` wrappers instead of the components
 * themselves, so the libraries are fetched asynchronously when the route
 * renders — never as part of any route's first-load JS. `npm run
 * check:bundle` fails the build if a heavy library leaks into an initial chunk.
 *
 * Charts render client-only (`ssr: false`): they measure the DOM, and a
 * skeleton with a fixed height keeps layout stable while the chunk loads.
 */

import dynamic from 'next/dynamic';

function ChartFallback({ height = 320, label = 'Loading chart…' }: { height?: number; label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="w-full animate-pulse rounded-2xl border border-white/5 bg-zinc-900/40"
      style={{ minHeight: height }}
    />
  );
}

const fallback = (height?: number, label?: string) => {
  const Fallback = () => <ChartFallback height={height} label={label} />;
  Fallback.displayName = 'ChartFallback';
  return Fallback;
};

// ── /analytics (recharts + d3) ──────────────────────────────────────────────
export const LazyAnalyticsDashboard = dynamic(() => import('@/components/analytics/Dashboard'), {
  ssr: false,
  loading: fallback(640, 'Loading analytics dashboard…'),
});

// ── /simulator (d3-force) ───────────────────────────────────────────────────
export const LazyNetworkGraph = dynamic(
  () => import('@/components/simulator/NetworkGraph').then((m) => m.NetworkGraph),
  { ssr: false, loading: fallback(600, 'Loading network graph…') }
);

// ── /mempool-auction (d3) ───────────────────────────────────────────────────
export const LazyLiveFeeMarket = dynamic(
  () => import('@/components/mempool-auction/LiveFeeMarket').then((m) => m.LiveFeeMarket),
  { ssr: false, loading: fallback(360, 'Loading live fee market…') }
);

// ── /performance-metrics (recharts) ─────────────────────────────────────────
export const LazyPerformanceMetricsDashboard = dynamic(
  () => import('@/components/performance-metrics/PerformanceMetricsDashboard'),
  { ssr: false, loading: fallback(520, 'Loading performance metrics…') }
);

// ── /quadratic-funding-sim (d3) ─────────────────────────────────────────────
export const LazyQuadraticFundingSimulator = dynamic(
  () => import('@/components/quadratic-funding/QuadraticFundingSimulator'),
  { ssr: false, loading: fallback(560, 'Loading simulator…') }
);

// ── /contract-performance (d3) ──────────────────────────────────────────────
export const LazyScatterPlot = dynamic(
  () => import('@/components/analytics/PerformanceVisualizations/ScatterPlot'),
  { ssr: false, loading: fallback(360, 'Loading scatter plot…') }
);
export const LazyHeatmap = dynamic(() => import('@/components/analytics/PerformanceVisualizations/Heatmap'), {
  ssr: false,
  loading: fallback(360, 'Loading heatmap…'),
});
export const LazyPerformanceNetworkGraph = dynamic(
  () => import('@/components/analytics/PerformanceVisualizations/NetworkGraph'),
  { ssr: false, loading: fallback(420, 'Loading dependency graph…') }
);

// ── /stellar-consensus-protocol (d3) ────────────────────────────────────────
export const LazySCPVisualizer = dynamic(
  () => import('@/components/stellar-scp/SCPVisualizer').then((m) => m.SCPVisualizer),
  { ssr: false, loading: fallback(520, 'Loading SCP visualizer…') }
);
export const LazyQuorumSliceExplorer = dynamic(
  () => import('@/components/stellar-scp/QuorumSliceExplorer').then((m) => m.QuorumSliceExplorer),
  { ssr: false, loading: fallback(420, 'Loading quorum explorer…') }
);

// ── /yield-calculator (chart.js + d3) ───────────────────────────────────────
export const LazyYieldProjectionChart = dynamic(
  () => import('@/components/yield-calculator/YieldProjectionChart').then((m) => m.YieldProjectionChart),
  { ssr: false, loading: fallback(320, 'Loading projection chart…') }
);
export const LazyLivePoolYield = dynamic(
  () => import('@/components/yield-calculator/LivePoolYield').then((m) => m.LivePoolYield),
  { ssr: false, loading: fallback(360, 'Loading live pool yield…') }
);
export const LazyTwapBacktestCanvas = dynamic(
  () => import('@/components/analytics/TwapBacktestCanvas').then((m) => m.TwapBacktestCanvas),
  { ssr: false, loading: fallback(480, 'Loading TWAP backtest…') }
);

// ── /devtools/fees (d3) ─────────────────────────────────────────────────────
export const LazyFeeChart = dynamic(() => import('@/components/devtools/FeeChart').then((m) => m.FeeChart), {
  ssr: false,
  loading: fallback(220, 'Loading fee chart…'),
});

// ── /wasm-analyzer (d3) ─────────────────────────────────────────────────────
export const LazyWasmMemoryProfiler = dynamic(
  () => import('@/components/visualizer/WasmMemoryProfiler').then((m) => m.WasmMemoryProfiler),
  { ssr: false, loading: fallback(640, 'Loading memory profiler…') }
);
