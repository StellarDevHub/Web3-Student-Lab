import type {
  NodeStatus,
  RoadmapNodeData,
  RoadmapEdgeData,
  ProgressData,
  RoadmapLayout,
  NodePosition,
  LayoutDirection,
  RoadmapCourse,
} from './types/roadmap';
import type { CourseLearningJourney, LearningLevel } from './learning-journey';

export const NODE_DIMENSIONS = { width: 160, height: 80 };
export const LEVEL_GAP = 140;
export const NODE_GAP = 40;

const STATUS_COLORS: Record<NodeStatus, string> = {
  locked: '#27272a',
  available: '#3b82f6',
  in_progress: '#f97316',
  completed: '#22c55e',
};

const STATUS_BG_COLORS: Record<NodeStatus, string> = {
  locked: 'rgba(39,39,42,0.3)',
  available: 'rgba(59,130,246,0.15)',
  in_progress: 'rgba(249,115,22,0.15)',
  completed: 'rgba(34,197,94,0.15)',
};

const STATUS_LABELS: Record<NodeStatus, string> = {
  locked: 'Locked',
  available: 'Available',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function getNodeColor(status: NodeStatus): string {
  return STATUS_COLORS[status];
}

export function getNodeBgColor(status: NodeStatus): string {
  return STATUS_BG_COLORS[status];
}

export function getNodeLabel(status: NodeStatus): string {
  return STATUS_LABELS[status];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateProgressPercent(
  completed: number,
  total: number
): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function getNodeStatus(
  moduleId: string,
  completedLessons: string[],
  prerequisites: string[],
  completedModules: string[]
): NodeStatus {
  if (completedLessons.includes(moduleId)) {
    return 'completed';
  }

  const allPrereqsMet = prerequisites.every((p) => completedModules.includes(p));
  if (!allPrereqsMet) {
    return 'locked';
  }

  if (completedModules.includes(moduleId)) {
    return 'completed';
  }

  const anyPrereqInProgress = prerequisites.some((p) =>
    completedLessons.some((l) => l.startsWith(p))
  );
  if (anyPrereqInProgress || prerequisites.length === 0) {
    return 'in_progress';
  }

  return 'available';
}

export function determineNodeStatus(
  moduleId: string,
  progress: ProgressData | null,
  prerequisites: string[]
): NodeStatus {
  if (!progress) {
    return prerequisites.length === 0 ? 'available' : 'locked';
  }

  const { completedLessons, currentModuleId, status: courseStatus } = progress;

  if (courseStatus === 'completed' || completedLessons.includes(moduleId)) {
    return 'completed';
  }

  const allPrereqsMet = prerequisites.every((p) => completedLessons.includes(p));
  if (!allPrereqsMet) {
    return 'locked';
  }

  if (currentModuleId === moduleId) {
    return 'in_progress';
  }

  if (prerequisites.length === 0 || allPrereqsMet) {
    return 'available';
  }

  return 'locked';
}

export function buildCourseFromJourney(
  courseId: string,
  journey: CourseLearningJourney
): RoadmapCourse {
  const nodes: RoadmapNodeData[] = [];
  const edges: RoadmapEdgeData[] = [];

  journey.levels.forEach((level: LearningLevel, index: number) => {
    const completedTasks = level.tasks.filter(
      (_task, _idx) => false
    );
    const progress =
      level.tasks.length > 0
        ? Math.round((completedTasks.length / level.tasks.length) * 100)
        : 0;

    const node: RoadmapNodeData = {
      id: level.id,
      title: level.title,
      description: level.summary,
      status: 'locked',
      moduleId: level.id,
      order: index,
      level: index,
      children: [] as string[],
      prerequisites:
        index > 0 ? [journey.levels[index - 1]!.id] : [],
      progress,
      taskCount: level.tasks.length,
      completedTaskCount: completedTasks.length,
    };
    nodes.push(node);

    if (index > 0) {
      const edge: RoadmapEdgeData = {
        id: `${journey.levels[index - 1]!.id}-to-${level.id}`,
        source: journey.levels[index - 1]!.id,
        target: level.id,
        type: 'progression',
      };
      edges.push(edge);
    }
  });

  return {
    id: courseId,
    title: journey.headline,
    description: `Learning journey with ${nodes.length} levels`,
    nodes,
    edges,
  };
}

export function computeLayout(
  nodes: RoadmapNodeData[],
  direction: LayoutDirection = 'vertical'
): RoadmapLayout {
  const positions: Record<string, NodePosition> = {};
  const levels = groupByLevel(nodes);
  const levelKeys = Object.keys(levels).sort(
    (a, b) => Number(a) - Number(b)
  );

  if (direction === 'vertical') {
    let maxWidth = 0;

    levelKeys.forEach((levelKey) => {
      const levelNodes = levels[Number(levelKey)]!;
      const totalWidth =
        levelNodes.length * NODE_DIMENSIONS.width +
        (levelNodes.length - 1) * NODE_GAP;
      const startX = -totalWidth / 2;
      const y = Number(levelKey) * LEVEL_GAP;

      levelNodes.forEach((node, i) => {
        positions[node.id] = {
          x: startX + i * (NODE_DIMENSIONS.width + NODE_GAP),
          y,
        };
      });

      if (totalWidth > maxWidth) maxWidth = totalWidth;
    });

    const totalHeight = levelKeys.length * LEVEL_GAP + NODE_DIMENSIONS.height;
    return {
      positions,
      width: maxWidth + NODE_DIMENSIONS.width,
      height: totalHeight,
    };
  }

  levelKeys.forEach((levelKey) => {
    const levelNodes = levels[Number(levelKey)]!;
    const y =
      (levelNodes.length - 1) * ((NODE_DIMENSIONS.height + NODE_GAP) / 2);

    levelNodes.forEach((node, i) => {
      positions[node.id] = {
        x: Number(levelKey) * LEVEL_GAP,
        y: -y + i * (NODE_DIMENSIONS.height + NODE_GAP),
      };
    });
  });

  const totalWidth = levelKeys.length * LEVEL_GAP + NODE_DIMENSIONS.width;
  const levelNodeCounts = levelKeys.map((k) => levels[Number(k)]!.length);
  const maxNodes = Math.max(...levelNodeCounts, 1);
  const totalHeight = maxNodes * (NODE_DIMENSIONS.height + NODE_GAP);

  return {
    positions,
    width: totalWidth,
    height: totalHeight,
  };
}

export function groupByLevel(
  nodes: RoadmapNodeData[]
): Record<number, RoadmapNodeData[]> {
  const levels: Record<number, RoadmapNodeData[]> = {};
  for (const node of nodes) {
    if (!levels[node.level]) {
      levels[node.level] = [];
    }
    levels[node.level]!.push(node);
  }
  return levels;
}

export function buildConnectorPath(
  source: NodePosition,
  target: NodePosition
): string {
  const sx = source.x + NODE_DIMENSIONS.width / 2;
  const sy = source.y + NODE_DIMENSIONS.height;
  const tx = target.x + NODE_DIMENSIONS.width / 2;
  const ty = target.y;
  const cy = (sy + ty) / 2;

  return `M ${sx} ${sy} C ${sx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`;
}

export function getAccessibleLabel(node: RoadmapNodeData): string {
  const statusLabel = getNodeLabel(node.status);
  return `${node.title}, ${statusLabel}. ${node.description}. Progress: ${node.progress} percent, ${node.completedTaskCount} of ${node.taskCount} tasks completed.`;
}

export function mergeProgressIntoNodes(
  nodes: RoadmapNodeData[],
  progress: ProgressData | null
): RoadmapNodeData[] {
  return nodes.map((node) => ({
    ...node,
    status: determineNodeStatus(
      node.moduleId,
      progress,
      node.prerequisites
    ),
  }));
}

export function generateCourseIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
