'use client';

import { useCallback } from 'react';
import type { RoadmapNodeData } from '@/lib/types/roadmap';
import { getNodeColor, getNodeLabel } from '@/lib/roadmap-utils';
import {
  CheckCircle2,
  Lock,
  Play,
  AlertCircle,
  ArrowRight,
  BookOpen,
  ListChecks,
} from 'lucide-react';

interface RoadmapDetailPanelProps {
  node: RoadmapNodeData | null;
  allNodes: RoadmapNodeData[];
  onNavigate: (nodeId: string) => void;
  onToggleComplete: (nodeId: string, completed: boolean) => void;
  courseTitle: string;
}

const STATUS_ICONS = {
  completed: CheckCircle2,
  in_progress: Play,
  available: AlertCircle,
  locked: Lock,
} as const;

export function RoadmapDetailPanel({
  node,
  allNodes,
  onNavigate,
  onToggleComplete,
  courseTitle,
}: RoadmapDetailPanelProps) {
  const handleAction = useCallback(() => {
    if (node && node.status !== 'locked') {
      onNavigate(node.id);
    }
  }, [node, onNavigate]);

  const handleToggle = useCallback(() => {
    if (node) {
      onToggleComplete(
        node.id,
        node.status !== 'completed'
      );
    }
  }, [node, onToggleComplete]);

  if (!node) {
    return (
      <aside
        className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl"
        role="complementary"
        aria-label="Node details"
      >
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="mb-4 text-white/20" size={48} aria-hidden="true" />
          <p className="text-sm text-gray-500">
            Select a node on the roadmap to view its details
          </p>
        </div>
      </aside>
    );
  }

  const color = getNodeColor(node.status);
  const Icon = STATUS_ICONS[node.status];
  const statusLabel = getNodeLabel(node.status);

  return (
    <aside
      className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl"
      role="complementary"
      aria-label={`Details for ${node.title}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest uppercase"
          style={{
            borderColor: `${color}40`,
            backgroundColor: `${color}10`,
            color,
          }}
        >
          <Icon size={12} aria-hidden="true" />
          {statusLabel}
        </span>
        <span className="text-[10px] font-bold text-gray-600">
          Level {node.level + 1}
        </span>
      </div>

      <h3 className="mb-2 text-xl font-bold tracking-tight text-white">
        {node.title}
      </h3>
      <p className="mb-6 text-sm leading-relaxed text-gray-400">
        {node.description}
      </p>

      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-gray-500">
            <ListChecks size={14} aria-hidden="true" />
            Tasks
          </span>
          <span className="font-medium text-white">
            {node.completedTaskCount}/{node.taskCount}
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${node.progress}%`,
              backgroundColor: color,
            }}
            role="progressbar"
            aria-valuenow={node.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${node.progress}% complete`}
          />
        </div>

        <p className="text-right text-[10px] text-gray-600">
          {node.progress}% complete
        </p>
      </div>

      {node.prerequisites.length > 0 && (
        <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
            Prerequisites
          </p>
          <ul className="space-y-1">
            {node.prerequisites.map((prereqId) => {
              const prereqNode = allNodes.find(n => n.id === prereqId);
              const prereqTitle = prereqNode ? prereqNode.title : prereqId;
              return (
                <li key={prereqId} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <ArrowRight size={10} aria-hidden="true" />
                  {prereqTitle}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleAction}
          disabled={node.status === 'locked'}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold tracking-widest uppercase transition-all ${
            node.status === 'locked'
              ? 'cursor-not-allowed bg-zinc-800 text-gray-600'
              : 'text-white hover:opacity-90 active:scale-[0.98]'
          }`}
          style={
            node.status !== 'locked'
              ? { backgroundColor: color }
              : undefined
          }
          aria-label={
            node.status === 'completed'
              ? `Review ${node.title}`
              : node.status === 'in_progress'
                ? `Continue ${node.title}`
                : node.status === 'available'
                  ? `Start ${node.title}`
                  : `${node.title} is locked`
          }
        >
          {node.status === 'completed'
            ? 'Review Module'
            : node.status === 'in_progress'
              ? 'Continue'
              : node.status === 'available'
                ? 'Start Module'
                : 'Locked'}
          {node.status !== 'locked' && <ArrowRight size={14} aria-hidden="true" />}
        </button>

        <button
          type="button"
          onClick={handleToggle}
          disabled={node.status === 'locked'}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-bold tracking-widest text-gray-400 uppercase transition-all hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={
            node.status === 'completed'
              ? `Mark ${node.title} as incomplete`
              : `Mark ${node.title} as complete`
          }
        >
          {node.status === 'completed' ? (
            <>Mark Incomplete</>
          ) : (
            <>
              <CheckCircle2 size={14} aria-hidden="true" />
              Mark Complete
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
