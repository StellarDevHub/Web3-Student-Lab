'use client';

import type { NodeStatus } from '@/lib/types/roadmap';
import { getNodeColor, getNodeLabel } from '@/lib/roadmap-utils';
import { CheckCircle2, Lock, Play, AlertCircle } from 'lucide-react';

const STATUS_ITEMS: Array<{ status: NodeStatus; icon: typeof CheckCircle2 }> =
  [
    { status: 'completed', icon: CheckCircle2 },
    { status: 'in_progress', icon: Play },
    { status: 'available', icon: AlertCircle },
    { status: 'locked', icon: Lock },
  ];

interface RoadmapLegendProps {
  className?: string;
}

export function RoadmapLegend({ className = '' }: RoadmapLegendProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-4 ${className}`}
      role="list"
      aria-label="Node status legend"
    >
      {STATUS_ITEMS.map(({ status, icon: Icon }) => (
        <div
          key={status}
          className="flex items-center gap-1.5"
          role="listitem"
        >
          <Icon
            size={14}
            color={getNodeColor(status)}
            aria-hidden="true"
          />
          <span className="text-xs tracking-wider text-gray-400 uppercase">
            {getNodeLabel(status)}
          </span>
        </div>
      ))}
    </div>
  );
}
