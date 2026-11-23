'use client';

import type { RoadmapEdgeData, NodePosition } from '@/lib/types/roadmap';
import { buildConnectorPath, getNodeColor } from '@/lib/roadmap-utils';
import type { NodeStatus } from '@/lib/types/roadmap';

interface RoadmapConnectorProps {
  edge: RoadmapEdgeData;
  sourcePosition: NodePosition;
  targetPosition: NodePosition;
  sourceStatus: NodeStatus;
  targetStatus: NodeStatus;
}

export function RoadmapConnector({
  edge,
  sourcePosition,
  targetPosition,
  sourceStatus,
  targetStatus,
}: RoadmapConnectorProps) {
  const path = buildConnectorPath(sourcePosition, targetPosition);
  const color = getNodeColor(sourceStatus);
  const isActive =
    sourceStatus === 'completed' || sourceStatus === 'in_progress';

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={isActive ? color : '#27272a'}
        strokeWidth={isActive ? 2.5 : 1.5}
        strokeDasharray={isActive ? 'none' : '6 4'}
        className="transition-all duration-500"
        aria-label={`Connection from ${edge.source} to ${edge.target}`}
      />
      {isActive && (
        <circle r="3" fill={color}>
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path={path}
          />
        </circle>
      )}
    </g>
  );
}
