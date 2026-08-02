'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// ============================================================================
// Type Definitions
// ============================================================================

export type NodeState = 'idle' | 'nominating' | 'voting' | 'accepted' | 'confirmed' | 'failed';
export type Phase = 'nomination' | 'ballot';
type MessageType = 'nominate' | 'vote' | 'accept' | 'confirm';

export interface SCPNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  isValidator: boolean;
  quorumSet: string[];
  failed: boolean;
}

export interface SCPEdge {
  source: string;
  target: string;
  active: boolean;
  messageType: MessageType;
}

export interface SCPState {
  phase: Phase;
  round: number;
  nodes: SCPNode[];
  edges: SCPEdge[];
  isRunning: boolean;
  speed: number;
  step: number;
}

// ============================================================================
// Color Configuration
// ============================================================================

const NODE_COLORS: Record<NodeState, string> = {
  idle: '#64748b',
  nominating: '#f59e0b',
  voting: '#3b82f6',
  accepted: '#8b5cf6',
  confirmed: '#10b981',
  failed: '#ef4444',
};

const EDGE_COLORS: Record<MessageType, string> = {
  nominate: '#f59e0b',
  vote: '#3b82f6',
  accept: '#8b5cf6',
  confirm: '#10b981',
};

const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  nomination: `🎯 Nomination Phase: Each validator broadcasts its candidate values. Nodes collect nominations from their quorum set and vote to confirm a composite candidate value.`,
  ballot: `🗳️ Ballot Phase: Validators attempt to reach agreement on a specific value. Each ballot round progresses through VOTE → ACCEPT → CONFIRM stages until consensus is reached.`,
};

// ============================================================================
// Utility Functions
// ============================================================================

const createInitialNodes = (): SCPNode[] => {
  const count = 7;
  const radius = 200;
  const cx = 400;
  const cy = 300;

  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    label: `V${i + 1}`,
    x: cx + radius * Math.cos((2 * Math.PI * i) / count),
    y: cy + radius * Math.sin((2 * Math.PI * i) / count),
    state: 'idle' as NodeState,
    isValidator: true,
    quorumSet: [
      `node-${(i + 1) % count}`,
      `node-${(i + 2) % count}`,
      `node-${(i + count - 1) % count}`,
    ],
    failed: false,
  }));
};

const createInitialEdges = (nodes: SCPNode[]): SCPEdge[] => {
  const edges: SCPEdge[] = [];
  nodes.forEach((node) => {
    node.quorumSet.forEach((targetId) => {
      edges.push({
        source: node.id,
        target: targetId,
        active: false,
        messageType: 'nominate',
      });
    });
  });
  return edges;
};

// ============================================================================
// Simulation Step Logic
// ============================================================================

const simulationStep = (state: SCPState): SCPState => {
  const { phase, round, nodes, step, isRunning } = state;

  if (!isRunning) return state;

  let newNodes = JSON.parse(JSON.stringify(nodes)) as SCPNode[];
  let newEdges = JSON.parse(JSON.stringify(state.edges)) as SCPEdge[];

  if (phase === 'nomination') {
    if (step === 0) {
      // Step 0: All non-failed nodes enter nominating state
      newNodes = newNodes.map((n) => ({
        ...n,
        state: n.failed ? 'failed' : ('nominating' as NodeState),
      }));
      newEdges = newEdges.map((e) => ({
        ...e,
        active: true,
        messageType: 'nominate',
      }));
    } else if (step === 1) {
      // Step 1: Nodes collect nominations, move to voting
      newEdges = newEdges.map((e) => ({ ...e, active: false }));
      newNodes = newNodes.map((n) => ({
        ...n,
        state: n.failed ? 'failed' : ('voting' as NodeState),
      }));
    } else if (step === 2) {
      // Step 2: Nomination complete, prepare for ballot phase
      return {
        ...state,
        phase: 'ballot',
        step: 0,
      };
    }
  } else if (phase === 'ballot') {
    if (step === 0) {
      // Step 0: Nodes broadcast votes
      newEdges = newEdges.map((e) => ({
        ...e,
        active: true,
        messageType: 'vote',
      }));
    } else if (step === 1) {
      // Step 1: Nodes receive votes and move to accepted
      newEdges = newEdges.map((e) => ({
        ...e,
        active: true,
        messageType: 'accept',
      }));
      newNodes = newNodes.map((n) => ({
        ...n,
        state: n.failed ? 'failed' : n.state === 'voting' ? ('accepted' as NodeState) : n.state,
      }));
    } else if (step === 2) {
      // Step 2: Quorum accepts, move to confirmed
      newEdges = newEdges.map((e) => ({
        ...e,
        active: true,
        messageType: 'confirm',
      }));
      newNodes = newNodes.map((n) => ({
        ...n,
        state: n.failed ? 'failed' : ('confirmed' as NodeState),
      }));
    } else if (step === 3) {
      // Step 3: Consensus reached
      newEdges = newEdges.map((e) => ({ ...e, active: false }));
      return {
        ...state,
        isRunning: false,
        step: state.step + 1,
      };
    }
  }

  return {
    ...state,
    nodes: newNodes,
    edges: newEdges,
    step: state.step + 1,
  };
};

// ============================================================================
// Main Component
// ============================================================================

export const SCPVisualizer: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scpState, setScpState] = useState<SCPState>({
    phase: 'nomination',
    round: 1,
    nodes: createInitialNodes(),
    edges: createInitialEdges(createInitialNodes()),
    isRunning: false,
    speed: 1000,
    step: 0,
  });

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Setup container dimensions
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: Math.max(600, rect.height),
      });
    }
  }, []);

  // Simulation loop
  useEffect(() => {
    if (!scpState.isRunning) return;

    const timer = setTimeout(() => {
      setScpState((prev) => simulationStep(prev));
    }, scpState.speed);

    return () => clearTimeout(timer);
  }, [scpState.isRunning, scpState.speed, scpState.step]);

  // D3 Visualization
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);

    // Bind edges
    const edgeSelection = svg
      .selectAll<SVGLineElement, SCPEdge>('.edge')
      .data(scpState.edges, (d: SCPEdge) => `${d.source}-${d.target}-${d.messageType}`);

    edgeSelection
      .enter()
      .append('line')
      .attr('class', 'edge')
      .attr('x1', (d) => scpState.nodes.find((n) => n.id === d.source)?.x || 0)
      .attr('y1', (d) => scpState.nodes.find((n) => n.id === d.source)?.y || 0)
      .attr('x2', (d) => scpState.nodes.find((n) => n.id === d.target)?.x || 0)
      .attr('y2', (d) => scpState.nodes.find((n) => n.id === d.target)?.y || 0)
      .attr('stroke', (d) => (d.active ? EDGE_COLORS[d.messageType] : '#334155'))
      .attr('stroke-width', (d) => (d.active ? 2 : 1))
      .attr('stroke-dasharray', (d) => (d.active ? '5,5' : 'none'))
      .attr('opacity', (d) => (d.active ? 0.8 : 0.2))
      .merge(edgeSelection)
      .transition()
      .duration(300)
      .attr('stroke', (d) => (d.active ? EDGE_COLORS[d.messageType] : '#334155'))
      .attr('stroke-width', (d) => (d.active ? 2 : 1))
      .attr('stroke-dasharray', (d) => (d.active ? '5,5' : 'none'))
      .attr('opacity', (d) => (d.active ? 0.8 : 0.2));

    edgeSelection.exit().remove();

    // Bind nodes
    const nodeSelection = svg
      .selectAll<SVGCircleElement, SCPNode>('.node')
      .data(scpState.nodes, (d: SCPNode) => d.id);

    nodeSelection
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', 30)
      .attr('fill', (d) => NODE_COLORS[d.state])
      .attr('stroke', (d) => (d.failed ? '#ef4444' : '#1e293b'))
      .attr('stroke-width', (d) => (d.failed ? 3 : 2))
      .style('cursor', 'pointer')
      .on('click', (_, d) => handleNodeClick(d))
      .merge(nodeSelection)
      .transition()
      .duration(300)
      .attr('fill', (d) => NODE_COLORS[d.state])
      .attr('stroke', (d) => (d.failed ? '#ef4444' : '#1e293b'))
      .attr('stroke-width', (d) => (d.failed ? 3 : 2));

    nodeSelection.exit().remove();

    // Bind labels
    const labelSelection = svg
      .selectAll<SVGTextElement, SCPNode>('.node-label')
      .data(scpState.nodes, (d: SCPNode) => d.id);

    labelSelection
      .enter()
      .append('text')
      .attr('class', 'node-label')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#f1f5f9')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => d.label)
      .merge(labelSelection)
      .transition()
      .duration(300)
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y);

    labelSelection.exit().remove();
  }, [scpState.nodes, scpState.edges, dimensions]);

  // Handlers
  const handleStart = () => {
    setScpState((prev) => ({ ...prev, isRunning: true }));
  };

  const handlePause = () => {
    setScpState((prev) => ({ ...prev, isRunning: false }));
  };

  const handleStep = () => {
    setScpState((prev) => simulationStep({ ...prev, isRunning: false }));
  };

  const handleReset = () => {
    const initialNodes = createInitialNodes();
    setScpState({
      phase: 'nomination',
      round: 1,
      nodes: initialNodes,
      edges: createInitialEdges(initialNodes),
      isRunning: false,
      speed: 1000,
      step: 0,
    });
  };

  const handleToggleNodeFailure = (nodeId: string) => {
    setScpState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, failed: !n.failed } : n)),
    }));
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScpState((prev) => ({
      ...prev,
      speed: Number(e.target.value),
    }));
  };

  const consensusReached =
    scpState.nodes.filter((n) => !n.failed).every((n) => n.state === 'confirmed');
  const consensusFailed =
    scpState.nodes.filter((n) => !n.failed).length <
    Math.ceil(scpState.nodes.length * 0.66);

  return (
    <div
      ref={containerRef}
      className="w-full bg-slate-950 text-slate-100 rounded-lg border border-slate-700 p-6 min-h-screen"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-blue-400">
          🌐 Stellar Consensus Protocol (SCP) Visualizer
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          Interactive demonstration of the Nomination and Ballot phases of the Stellar Consensus
          Protocol
        </p>
      </div>

      {/* Main Layout */}
      <div className="flex gap-6">
        {/* SVG Container */}
        <div className="flex-1">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg">
            <svg
              ref={svgRef}
              width={dimensions.width - 32}
              height={600}
              className="w-full bg-slate-900 rounded"
              viewBox={`0 0 ${dimensions.width - 32} 600`}
              preserveAspectRatio="xMidYMid meet"
            >
              <title>Stellar Consensus Protocol Network Visualization</title>
              <desc>
                An interactive visualization showing validator nodes and their consensus process
                through nomination and ballot phases.
              </desc>
            </svg>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-64 space-y-4">
          {/* Phase Badge */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Current Phase
            </div>
            <div className="bg-blue-600 text-white px-3 py-2 rounded-lg text-center font-semibold text-sm">
              {scpState.phase === 'nomination' ? '📋 Nomination' : '🗳️ Ballot'}
            </div>
            <div className="text-xs text-slate-400 mt-3">Round {scpState.round}</div>
          </div>

          {/* Controls */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Simulation Controls
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
              disabled={scpState.isRunning}
            >
              ▶ Start
            </button>

            <button
              onClick={handlePause}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
              disabled={!scpState.isRunning}
            >
              ⏸ Pause
            </button>

            <button
              onClick={handleStep}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              ⏭ Step
            </button>

            <button
              onClick={handleReset}
              className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              ↺ Reset
            </button>
          </div>

          {/* Speed Control */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Speed
            </label>
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={scpState.speed}
              onChange={handleSpeedChange}
              className="w-full"
            />
            <div className="text-xs text-slate-500 mt-2">{(3000 - scpState.speed) / 500}x</div>
          </div>

          {/* Node Status */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Node States
            </div>
            <div className="space-y-2">
              {scpState.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 p-2 bg-slate-700 rounded cursor-pointer hover:bg-slate-600 transition-colors text-xs"
                  onClick={() => handleToggleNodeFailure(node.id)}
                  title={`Click to toggle failure state. Currently: ${node.failed ? 'FAILED' : node.state.toUpperCase()}`}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: NODE_COLORS[node.state] }}
                  />
                  <span className="flex-1">{node.label}</span>
                  {node.failed && <span className="text-red-400">✗</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Legend
            </div>
            <div className="space-y-2">
              {Object.entries(NODE_COLORS).map(([state, color]) => (
                <div key={state} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-slate-300 capitalize">{state}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phase Description */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Phase Info
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {PHASE_DESCRIPTIONS[scpState.phase]}
            </p>
          </div>

          {/* Status */}
          {consensusReached && (
            <div className="bg-green-900 border border-green-700 rounded-lg p-4 text-center">
              <div className="text-sm font-semibold text-green-300">✓ Consensus Reached</div>
            </div>
          )}

          {consensusFailed && !scpState.isRunning && scpState.step > 0 && (
            <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-center">
              <div className="text-sm font-semibold text-red-300">✗ Consensus Failed</div>
            </div>
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-6 p-4 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400">
        <strong>💡 Tips:</strong> Click any node to toggle its failure state. Use the Step button to advance the
        simulation one step at a time. The simulation demonstrates how validators reach consensus
        even with some failures.
      </div>
    </div>
  );
};

export default SCPVisualizer;
