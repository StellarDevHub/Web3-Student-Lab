export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface RoadmapNodeData {
  id: string;
  title: string;
  description: string;
  status: NodeStatus;
  moduleId: string;
  order: number;
  level: number;
  children: string[];
  prerequisites: string[];
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  icon?: string;
}

export interface RoadmapEdgeData {
  id: string;
  source: string;
  target: string;
  type: 'prerequisite' | 'progression';
}

export interface RoadmapCourse {
  id: string;
  title: string;
  description: string;
  nodes: RoadmapNodeData[];
  edges: RoadmapEdgeData[];
}

export interface ProgressData {
  completedLessons: string[];
  currentModuleId: string | null;
  percentage: number;
  status: 'not_started' | 'in_progress' | 'completed';
  lastAccessedAt: string | null;
  completedAt: string | null;
}

export type LayoutDirection = 'vertical' | 'horizontal';

export interface NodePosition {
  x: number;
  y: number;
}

export interface RoadmapLayout {
  positions: Record<string, NodePosition>;
  width: number;
  height: number;
}

export interface RoadmapViewState {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  layout: RoadmapLayout;
}
