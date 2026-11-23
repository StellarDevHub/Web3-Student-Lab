'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  SCP_PHASES,
  ScpNode,
  addSybils,
  buildTierOneTopology,
  findQuorum,
  networkHealth,
  partition,
  simulateVoting,
  trustEdges,
} from '@/lib/scp';

/**
 * Interactive quorum slice explorer (Issue #1158).
 *
 * A force-directed view of who trusts whom, with the safety and liveness
 * consequences recomputed live as the student cuts the graph. The point it is
 * built to land: SCP halts rather than forks, and Sybils buy nothing because
 * trust is named rather than counted.
 */

const HEIGHT = 420;

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  organization?: string;
  online: boolean;
  byzantine?: boolean;
  status: 'live' | 'blocked' | 'down';
}

const STATUS_COLOR: Record<SimNode['status'], string> = {
  live: '#22c55e',
  blocked: '#f59e0b',
  down: '#6b7280',
};

export function QuorumSliceExplorer() {
  const [offline, setOffline] = useState<string[]>([]);
  const [sybilCount, setSybilCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const base = useMemo(() => buildTierOneTopology(3, 3), []);

  const nodes: ScpNode[] = useMemo(() => {
    const withSybils = sybilCount > 0 ? addSybils(base, sybilCount) : base;
    return partition(withSybils, offline);
  }, [base, offline, sybilCount]);

  const health = useMemo(() => networkHealth(nodes), [nodes]);
  const phases = useMemo(() => simulateVoting(nodes), [nodes]);
  const selectedQuorum = useMemo(
    () => (selected ? findQuorum(selected, nodes) : null),
    [selected, nodes],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const parent = svgRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(320, next));
    });
    observer.observe(parent);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      organization: n.organization,
      online: n.online,
      byzantine: n.byzantine,
      status: !n.online ? 'down' : health.live.includes(n.id) ? 'live' : 'blocked',
    }));

    // d3.forceLink rewrites source/target from ids into node objects in place,
    // so the datum is only string-shaped until the simulation has run once.
    type SimLink = d3.SimulationLinkDatum<SimNode>;
    const links: SimLink[] = trustEdges(nodes).map((l) => ({ ...l }) as unknown as SimLink);

    const root = svg.attr('width', width).attr('height', HEIGHT).append('g');

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => (d as SimNode).id)
          .distance(70)
          .strength(0.15),
      )
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(width / 2, HEIGHT / 2))
      .force('collide', d3.forceCollide(26));

    const link = root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1);

    const node = root
      .append('g')
      .selectAll('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => (d.byzantine ? 8 : 16))
      .attr('fill', (d) => (d.byzantine ? '#7f1d1d' : STATUS_COLOR[d.status]))
      .attr('stroke', (d) => (selectedQuorum?.includes(d.id) ? '#facc15' : '#0f172a'))
      .attr('stroke-width', (d) => (selectedQuorum?.includes(d.id) ? 3 : 1.5))
      .style('cursor', 'pointer')
      .on('click', (_event, d) => setSelected((current) => (current === d.id ? null : d.id)));

    node.append('title').text((d) => `${d.id} — ${d.status}`);

    const label = root
      .append('g')
      .selectAll('text')
      .data(simNodes.filter((d) => !d.byzantine))
      .join('text')
      .text((d) => d.id.replace('_n', '.'))
      .attr('font-size', 9)
      .attr('fill', '#cbd5f5')
      .attr('text-anchor', 'middle')
      .attr('dy', -20);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
    });

    return () => {
      // The simulation runs its own timer; without stopping it the ticks keep
      // firing against nodes that have been detached.
      simulation.stop();
      svg.selectAll('*').remove();
    };
  }, [nodes, health, width, selectedQuorum]);

  const toggleOffline = (id: string) =>
    setOffline((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950">
      <header className="border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-black tracking-widest text-white uppercase">
          Quorum Slice Explorer
        </h2>
        <p className="mt-1 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
          Federated Byzantine Agreement — trust is chosen, not counted
        </p>
      </header>

      {/* Safety / liveness verdict */}
      <div className="grid grid-cols-1 gap-4 border-b border-white/10 px-6 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Safety</p>
          <p className={`font-mono text-lg ${health.safe ? 'text-green-400' : 'text-red-500'}`}>
            {health.safe ? 'quorums intersect' : 'SPLIT — fork possible'}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Liveness</p>
          <p
            className={`font-mono text-lg ${health.hasLiveness ? 'text-green-400' : 'text-amber-400'}`}
          >
            {health.hasLiveness ? `${health.live.length} nodes progressing` : 'halted'}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Blocked / down</p>
          <p className="font-mono text-lg text-gray-300">
            {health.blocked.length} / {health.down.length}
          </p>
        </div>
      </div>

      <div className="px-6 py-4">
        <svg ref={svgRef} role="img" aria-label="Quorum trust graph" />
      </div>

      {/* Consensus debugger */}
      <div className="border-t border-white/10 px-6 py-4">
        <p className="mb-3 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
          Federated voting
        </p>
        <ol className="space-y-2">
          {phases.map((step) => (
            <li key={step.phase} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${step.complete ? 'bg-green-500' : 'bg-gray-700'}`}
                aria-hidden
              />
              <div>
                <p className="font-mono text-xs text-white uppercase">
                  {step.phase}
                  {!step.complete && (
                    <span className="ml-2 text-amber-400 normal-case">— cannot complete</span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500">{step.explanation}</p>
              </div>
            </li>
          ))}
        </ol>
        {!health.safe && (
          <p className="mt-3 text-xs text-red-400">
            Without quorum intersection the phases are held back deliberately: two halves could
            each externalize a different value and neither would be wrong from where it sits.
          </p>
        )}
        {health.safe && !health.hasLiveness && (
          <p className="mt-3 text-xs text-amber-400">
            Every node is blocked. SCP stops rather than guessing — safety is preserved, progress
            is not. That is the tradeoff.
          </p>
        )}
      </div>

      {/* Attack controls */}
      <div className="grid grid-cols-1 gap-6 border-t border-white/10 px-6 py-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Partition validators
          </p>
          <div className="flex flex-wrap gap-2">
            {base.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleOffline(n.id)}
                aria-pressed={offline.includes(n.id)}
                className={`rounded border px-2 py-1 font-mono text-[10px] ${
                  offline.includes(n.id)
                    ? 'border-red-600/50 bg-red-950/40 text-red-300'
                    : 'border-white/10 bg-black text-gray-300 hover:border-white/30'
                }`}
              >
                {n.id.replace('_n', '.')}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-600">
            Take a whole organisation down and the network survives. Take a second and it halts.
          </p>
        </div>

        <div>
          <label
            htmlFor="sybil-count"
            className="mb-2 block text-[10px] tracking-[0.2em] text-gray-500 uppercase"
          >
            Sybil nodes — {sybilCount}
          </label>
          <input
            id="sybil-count"
            type="range"
            min={0}
            max={40}
            value={sybilCount}
            onChange={(e) => setSybilCount(Number(e.target.value))}
            className="w-full accent-red-600"
          />
          <p className="mt-2 text-[10px] text-gray-600">
            Add as many as you like. Safety never moves: nobody named them in a quorum set, so
            they cannot join anyone&apos;s quorum. This is why FBA needs no proof-of-work to
            resist Sybils.
          </p>
        </div>
      </div>

      {/* Selected node's quorum */}
      {selected && (
        <div className="border-t border-white/10 px-6 py-4">
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Minimal quorum for {selected}
          </p>
          <p className="mt-1 font-mono text-xs text-yellow-300">
            {selectedQuorum ? selectedQuorum.join(', ') : 'none — this node is blocked'}
          </p>
        </div>
      )}
    </section>
  );
}
