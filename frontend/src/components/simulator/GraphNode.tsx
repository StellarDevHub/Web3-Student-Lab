import { motion } from 'framer-motion';
import React from 'react';
import { NetworkNode } from '../../lib/visualization/ForceSimulation';

interface GraphNodeProps {
  node: NetworkNode;
  onClick: (node: NetworkNode) => void;
}

export const GraphNode: React.FC<GraphNodeProps> = ({ node, onClick }) => {
  const color = node.type === 'account' ? '#ef4444' : node.type === 'asset' ? '#3b82f6' : '#10b981';

  return (
    <motion.g
      initial={{ scale: 0 }}
      animate={{ scale: 1, x: node.x, y: node.y }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      onClick={() => onClick(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(node);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${node.type === 'account' ? 'Account' : node.type === 'asset' ? 'Asset' : 'Node'}: ${node.label || node.id}. Click to view details.`}
      style={{ cursor: 'pointer' }}
    >
      <circle
        r={12}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        className="drop-shadow-lg"
        aria-hidden="true"
      />
      <motion.circle
        r={12}
        fill="transparent"
        stroke={color}
        strokeWidth={2}
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        aria-hidden="true"
      />
      <text
        dy={25}
        textAnchor="middle"
        fill="#888"
        fontSize="10"
        className="font-mono font-bold tracking-tighter uppercase"
        aria-hidden="true"
      >
        {node.label || node.id.slice(0, 4)}
      </text>
    </motion.g>
  );
};
