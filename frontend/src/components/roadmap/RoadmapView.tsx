'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Course } from '@/lib/api';
import type { RoadmapNodeData } from '@/lib/types/roadmap';
import { useRoadmapProgress } from '@/hooks/useRoadmapProgress';
import { computeLayout } from '@/lib/roadmap-utils';
import { RoadmapNode } from './RoadmapNode';
import { RoadmapConnector } from './RoadmapConnector';
import { RoadmapDetailPanel } from './RoadmapDetailPanel';
import { RoadmapLegend } from './RoadmapLegend';
import { RoadmapSkeleton } from './RoadmapSkeleton';
import { RoadmapErrorFallback } from './RoadmapErrorFallback';

interface RoadmapViewProps {
  course: Course | null;
}

export function RoadmapView({ course }: RoadmapViewProps) {
  const router = useRouter();
  const {
    nodes,
    selectedNodeId,
    hoveredNodeId,
    loading,
    error,
    overallProgress,
    courseTitle,
    selectNode,
    setHoveredNode,
    refetch,
    updateNodeProgress,
    course: roadmapCourse,
  } = useRoadmapProgress(course);

  const layout = useMemo(() => {
    if (nodes.length === 0) return null;
    return computeLayout(nodes, 'vertical');
  }, [nodes]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const statusMap = useMemo(() => {
    const map: Record<string, RoadmapNodeData['status']> = {};
    for (const node of nodes) {
      map[node.id] = node.status;
    }
    return map;
  }, [nodes]);

  const handleNavigate = (nodeId: string) => {
    if (roadmapCourse) {
      router.push(`/courses/${roadmapCourse.id}?module=${nodeId}`);
    }
  };

  const handleToggleComplete = async (
    nodeId: string,
    completed: boolean
  ) => {
    await updateNodeProgress(nodeId, completed);
  };

  if (loading) {
    return <RoadmapSkeleton />;
  }

  if (error) {
    return <RoadmapErrorFallback message={error} onRetry={refetch} />;
  }

  if (!roadmapCourse || nodes.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/10 p-8">
        <p className="text-sm text-gray-500">
          No roadmap data available. Enroll in a course to see your learning path.
        </p>
      </div>
    );
  }

  const svgWidth = layout ? Math.max(layout.width + 80, 600) : 600;
  const svgHeight = layout ? Math.max(layout.height + 80, 400) : 400;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {courseTitle}
          </h2>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            {roadmapCourse.nodes.length} modules
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Overall Progress</span>
            <span
              className="text-sm font-bold text-white"
              aria-live="polite"
            >
              {overallProgress}%
            </span>
          </div>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] transition-all duration-700"
              style={{ width: `${overallProgress}%` }}
              role="progressbar"
              aria-valuenow={overallProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${overallProgress}% overall progress`}
            />
          </div>
        </div>
      </div>

      <RoadmapLegend className="border-b border-white/5 pb-4" />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div
          className="relative flex min-h-[500px] items-center justify-center overflow-auto rounded-2xl border border-white/5 bg-zinc-950/40 p-4"
          role="application"
          aria-label="Interactive learning roadmap"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#222_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />

          <div
            className="relative"
            style={{ width: svgWidth, height: svgHeight }}
          >
            <svg
              className="absolute inset-0 overflow-visible"
              width={svgWidth}
              height={svgHeight}
              viewBox={`${-(svgWidth / 2)} ${-40} ${svgWidth} ${svgHeight}`}
              aria-hidden="true"
            >
              {roadmapCourse.edges.map((edge) => {
                const srcPos = layout?.positions[edge.source];
                const tgtPos = layout?.positions[edge.target];
                if (!srcPos || !tgtPos) return null;

                return (
                  <RoadmapConnector
                    key={edge.id}
                    edge={edge}
                    sourcePosition={srcPos}
                    targetPosition={tgtPos}
                    sourceStatus={statusMap[edge.source] ?? 'locked'}
                    targetStatus={statusMap[edge.target] ?? 'locked'}
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const pos = layout?.positions[node.id];
              if (!pos) return null;

              // Shift coords to match top-left of the wrapper
              const shiftedPos = { x: pos.x + svgWidth / 2, y: pos.y + 40 };

              return (
                <RoadmapNode
                  key={node.id}
                  node={node}
                  position={shiftedPos}
                  isSelected={selectedNodeId === node.id}
                  isHovered={hoveredNodeId === node.id}
                  onSelect={selectNode}
                  onHover={setHoveredNode}
                />
              );
            })}
          </div>
        </div>

        <RoadmapDetailPanel
          node={selectedNode}
          allNodes={nodes}
          onNavigate={handleNavigate}
          onToggleComplete={handleToggleComplete}
          courseTitle={courseTitle}
        />
      </div>
    </div>
  );
}
