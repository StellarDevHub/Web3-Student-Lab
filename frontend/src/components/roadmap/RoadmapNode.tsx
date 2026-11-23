'use client';

import { type KeyboardEvent, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { RoadmapNodeData, NodePosition } from '@/lib/types/roadmap';
import {
  getNodeColor,
  getNodeBgColor,
  getAccessibleLabel,
} from '@/lib/roadmap-utils';
import { CheckCircle2, Lock, Play, AlertCircle } from 'lucide-react';

interface RoadmapNodeProps {
  node: RoadmapNodeData;
  position: NodePosition;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  index?: number; // Optional index to stagger entry animations cleanly
}

const STATUS_ICONS = {
  completed: CheckCircle2,
  in_progress: Play,
  available: AlertCircle,
  locked: Lock,
} as const;

export function RoadmapNode({
  node,
  position,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  index = 0,
}: RoadmapNodeProps) {
  const color = getNodeColor(node.status);
  const bgColor = getNodeBgColor(node.status);
  const accessibleLabel = getAccessibleLabel(node);
  const Icon = STATUS_ICONS[node.status];

  const handleClick = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(node.id);
      }
    },
    [node.id, onSelect]
  );

  const handleMouseEnter = useCallback(() => {
    onHover(node.id);
  }, [node.id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={accessibleLabel}
      aria-current={isSelected ? 'step' : undefined}
      aria-disabled={node.status === 'locked'}
      tabIndex={0}

      // 1. Framer Motion Lifecycle Animations
      initial={{ opacity: 0, scale: 0.8, x: position.x, y: position.y + 20 }}
      animate={{
        opacity: node.status === 'locked' ? 0.5 : 1,
        scale: isSelected ? 1.1 : isHovered ? 1.05 : 1,
        x: position.x + (isSelected ? -4 : 0),
        y: position.y + (isSelected ? -4 : 0),
        borderColor: isSelected ? color : `${color}40`,
        backgroundColor: isSelected ? bgColor : 'rgba(0,0,0,0.3)'
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: index * 0.05
      }}

      className={`group absolute flex flex-col items-center justify-center rounded-xl border-2 transition-shadow duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-strong)] ${
        isSelected
          ? 'z-30 shadow-xl'
          : isHovered
            ? 'z-20'
            : 'z-10'
      } ${
        node.status === 'locked'
          ? 'cursor-not-allowed'
          : 'cursor-pointer'
      }`}
      style={{
        width: 160,
        height: 80,
      }}
    >
      <Icon
        className="mb-1"
        size={18}
        color={color}
        aria-hidden="true"
      />
      <span
        className="text-center text-xs font-semibold leading-tight tracking-wide"
        style={{ color }}
      >
        {node.title}
      </span>
      {node.status === 'in_progress' && (
        <span className="mt-1 text-[10px] font-medium text-white/60">
          {node.progress}%
        </span>
      )}
    </motion.button>
  );
}
