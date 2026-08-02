import ScatterPlot, { type ScatterDatum } from '@/components/analytics/PerformanceVisualizations/ScatterPlot';
import Heatmap, { type HeatmapDatum } from '@/components/analytics/PerformanceVisualizations/Heatmap';
import NetworkGraph, { type LinkDatum, type NodeDatum } from '@/components/analytics/PerformanceVisualizations/NetworkGraph';

const scatterData: ScatterDatum[] = Array.from({ length: 80 }, (_, index) => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  r: Math.random() * 8 + 4,
  label: `Transaction ${index + 1}`,
}));

const heatmapData: HeatmapDatum[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((x) =>
  ['1', '2', '3', '4', '5'].map((y) => ({
    x,
    y,
    value: Math.random() * 100,
  }))
);

const networkNodes: NodeDatum[] = [
  { id: 'Contract', group: 1 },
  { id: 'Verifier', group: 2 },
  { id: 'Storage', group: 2 },
  { id: 'Oracle', group: 3 },
  { id: 'Scheduler', group: 3 },
];

const networkLinks: LinkDatum[] = [
  { source: 'Contract', target: 'Verifier', value: 1 },
  { source: 'Contract', target: 'Storage', value: 1 },
  { source: 'Contract', target: 'Oracle', value: 1 },
  { source: 'Oracle', target: 'Scheduler', value: 1 },
];

export default function ContractPerformancePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold">Contract Performance Insights</h1>
          <p className="max-w-3xl text-slate-300">
            Visualize execution metrics for deployed contracts with D3-powered components designed for large datasets.
          </p>
        </header>

        <div className="grid gap-8 xl:grid-cols-2">
          <ScatterPlot data={scatterData} />
          <Heatmap data={heatmapData} />
        </div>

        <NetworkGraph nodes={networkNodes} links={networkLinks} />
      </div>
    </main>
  );
}
