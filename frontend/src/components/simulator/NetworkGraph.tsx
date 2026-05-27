import { Maximize, Search, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNetworkGraph } from '../../hooks/useNetworkGraph';
import { NetworkNode as NodeData } from '../../lib/visualization/ForceSimulation';
import { GraphEdge } from './GraphEdge';
import { GraphNode } from './GraphNode';
import { NodeDetailPanel } from './NodeDetailPanel';

interface NetworkGraphProps {
  transactions: any[];
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ transactions }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { graph, addTransaction } = useNetworkGraph(dimensions.width, dimensions.height);

  // Sync new transactions to graph
  useEffect(() => {
    if (transactions.length > 0) {
      addTransaction(transactions[0]);
    }
  }, [transactions, addTransaction]);

  const filteredNodes = graph.nodes.filter((n) =>
    n.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      className="group relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
    >
      {/* Controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <div
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 p-1 backdrop-blur-md"
          role="toolbar"
          aria-label="Graph zoom controls"
        >
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}
            className="rounded p-2 transition-colors hover:bg-white/10"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}
            className="rounded p-2 transition-colors hover:bg-white/10"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="rounded p-2 transition-colors hover:bg-white/10"
            aria-label="Reset zoom to 100%"
          >
            <Maximize size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-md">
          <Search size={14} className="text-gray-500" aria-hidden="true" />
          <label htmlFor="graph-search" className="sr-only">
            Search account in graph
          </label>
          <input
            id="graph-search"
            type="text"
            placeholder="Search Account..."
            className="w-32 border-none bg-transparent font-mono text-xs outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search account in graph"
          />
        </div>
      </div>

      {/* Screen reader description of the graph */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <p>
          Network graph visualization showing {graph.nodes.length} nodes and {graph.edges.length}{' '}
          connections.
          {filteredNodes.length !== graph.nodes.length
            ? ` Filtered to ${filteredNodes.length} nodes matching "${search}".`
            : ''}{' '}
          Nodes represent Stellar accounts and assets. Edges represent transactions between them.
          {graph.nodes.length > 0 &&
            ` Accounts: ${graph.nodes
              .filter((n) => n.type === 'account')
              .map((n) => n.label || n.id.slice(0, 8))
              .join(', ')}.`}
        </p>
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label={`Stellar network graph with ${graph.nodes.length} nodes and ${graph.edges.length} transaction edges`}
      >
        <title>Stellar Network Transaction Graph</title>
        <desc>
          An interactive force-directed graph showing Stellar blockchain accounts and assets as
          nodes, with transaction flows represented as animated edges between them.
          {graph.nodes.length > 0
            ? ` Currently displaying ${graph.nodes.filter((n) => n.type === 'account').length} accounts and ${graph.nodes.filter((n) => n.type === 'asset').length} assets.`
            : ' No transactions have been recorded yet.'}
        </desc>
        <g
          transform={`translate(${dimensions.width / 2}, ${dimensions.height / 2}) scale(${zoom}) translate(${-dimensions.width / 2}, ${-dimensions.height / 2})`}
        >
          {graph.edges.map((edge) => (
            <GraphEdge key={edge.id} edge={edge} />
          ))}
          {filteredNodes.map((node) => (
            <GraphNode key={node.id} node={node} onClick={setSelectedNode} />
          ))}
        </g>
      </svg>

      {selectedNode && (
        <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}

      <div className="pointer-events-none absolute bottom-4 left-4" aria-hidden="true">
        <h4 className="text-[10px] font-black tracking-widest text-gray-500 uppercase">
          Graph Visualization Engine
        </h4>
        <div className="mt-1 flex gap-4" role="list" aria-label="Graph legend">
          <div className="flex items-center gap-1.5" role="listitem">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span className="text-[9px] text-gray-400 uppercase">Accounts</span>
          </div>
          <div className="flex items-center gap-1.5" role="listitem">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span className="text-[9px] text-gray-400 uppercase">Assets</span>
          </div>
        </div>
      </div>
    </div>
  );
};
