import { motion } from 'framer-motion';
import React from 'react';
import { NetworkNode, TransactionEdge } from '../../lib/visualization/ForceSimulation';

interface GraphEdgeProps {
  edge: TransactionEdge;
}

export const GraphEdge: React.FC<GraphEdgeProps> = ({ edge }) => {
  const source = edge.source as NetworkNode;
  const target = edge.target as NetworkNode;

  if (!source.x || !source.y || !target.x || !target.y) return null;

  return (
    <g aria-hidden="true">
      <line
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke="#ffffff22"
        strokeWidth={1}
      />
      {/* Transaction flow particle */}
      <motion.circle
        r={3}
        fill="#ef4444"
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          offsetPath: `path('M ${source.x} ${source.y} L ${target.x} ${target.y}')`,
          boxShadow: '0 0 10px #ef4444',
        }}
      />
      {/* Label for asset/amount */}
      <text
        x={(source.x + target.x) / 2}
        y={(source.y + target.y) / 2}
        dy={-5}
        fill="#666"
        fontSize="8"
        textAnchor="middle"
        className="font-mono"
      >
        {edge.amount} {edge.asset}
      </text>
    </g>
  );
};
