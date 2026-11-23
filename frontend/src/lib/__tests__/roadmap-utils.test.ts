import { describe, it, expect } from 'vitest';
import type {
  RoadmapNodeData,
  RoadmapEdgeData,
  ProgressData,
  RoadmapLayout,
} from '@/lib/types/roadmap';
import type { CourseLearningJourney, LearningLevel } from '@/lib/learning-journey';
import {
  getNodeColor,
  getNodeBgColor,
  getNodeLabel,
  clamp,
  calculateProgressPercent,
  getNodeStatus,
  determineNodeStatus,
  buildCourseFromJourney,
  computeLayout,
  groupByLevel,
  buildConnectorPath,
  getAccessibleLabel,
  mergeProgressIntoNodes,
  generateCourseIdFromTitle,
  NODE_DIMENSIONS,
  LEVEL_GAP,
  NODE_GAP,
} from '../roadmap-utils';

describe('roadmap-utils', () => {
  describe('getNodeColor', () => {
    it('returns correct color for locked status', () => {
      expect(getNodeColor('locked')).toBe('#27272a');
    });

    it('returns correct color for available status', () => {
      expect(getNodeColor('available')).toBe('#3b82f6');
    });

    it('returns correct color for in_progress status', () => {
      expect(getNodeColor('in_progress')).toBe('#f97316');
    });

    it('returns correct color for completed status', () => {
      expect(getNodeColor('completed')).toBe('#22c55e');
    });
  });

  describe('getNodeBgColor', () => {
    it('returns correct bg color for each status', () => {
      expect(getNodeBgColor('locked')).toBe('rgba(39,39,42,0.3)');
      expect(getNodeBgColor('available')).toBe('rgba(59,130,246,0.15)');
      expect(getNodeBgColor('in_progress')).toBe('rgba(249,115,22,0.15)');
      expect(getNodeBgColor('completed')).toBe('rgba(34,197,94,0.15)');
    });
  });

  describe('getNodeLabel', () => {
    it('returns human-readable labels', () => {
      expect(getNodeLabel('locked')).toBe('Locked');
      expect(getNodeLabel('available')).toBe('Available');
      expect(getNodeLabel('in_progress')).toBe('In Progress');
      expect(getNodeLabel('completed')).toBe('Completed');
    });
  });

  describe('clamp', () => {
    it('clamps value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-1, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 0)).toBe(0);
      expect(clamp(5, 5, 5)).toBe(5);
    });
  });

  describe('calculateProgressPercent', () => {
    it('calculates percentage correctly', () => {
      expect(calculateProgressPercent(5, 10)).toBe(50);
      expect(calculateProgressPercent(0, 10)).toBe(0);
      expect(calculateProgressPercent(10, 10)).toBe(100);
    });

    it('returns 0 when total is 0', () => {
      expect(calculateProgressPercent(0, 0)).toBe(0);
      expect(calculateProgressPercent(5, 0)).toBe(0);
    });
  });

  describe('getNodeStatus', () => {
    it('returns completed when moduleId is in completedLessons', () => {
      expect(
        getNodeStatus('mod-1', ['mod-1'], [], [])
      ).toBe('completed');
    });

    it('returns locked when prerequisites are not met', () => {
      expect(
        getNodeStatus('mod-2', [], ['mod-1'], [])
      ).toBe('locked');
    });

    it('returns completed when moduleId is in completedModules with met prerequisites', () => {
      expect(
        getNodeStatus('mod-2', ['mod-1'], ['mod-1'], ['mod-1', 'mod-2'])
      ).toBe('completed');
    });

    it('returns in_progress when no prerequisites or prereq in progress', () => {
      expect(
        getNodeStatus('mod-1', ['mod-0-p1'], [], [])
      ).toBe('in_progress');
    });

    it('returns in_progress when prerequisites length is 0', () => {
      expect(getNodeStatus('mod-1', [], [], [])).toBe('in_progress');
    });

    it('returns available when prerequisites met but not started', () => {
      expect(
        getNodeStatus('mod-2', ['other-mod'], ['mod-1'], ['mod-1'])
      ).toBe('available');
    });
  });

  describe('determineNodeStatus', () => {
    const makeProgress = (overrides: Partial<ProgressData> = {}): ProgressData => ({
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
      ...overrides,
    });

    it('returns available with no progress and no prerequisites', () => {
      expect(determineNodeStatus('mod-1', null, [])).toBe('available');
    });

    it('returns locked with no progress and prerequisites', () => {
      expect(determineNodeStatus('mod-2', null, ['mod-1'])).toBe('locked');
    });

    it('returns completed when course status is completed', () => {
      const progress = makeProgress({ status: 'completed' });
      expect(determineNodeStatus('mod-1', progress, [])).toBe('completed');
    });

    it('returns completed when module is in completedLessons', () => {
      const progress = makeProgress({ completedLessons: ['mod-1'] });
      expect(determineNodeStatus('mod-1', progress, [])).toBe('completed');
    });

    it('returns locked when prerequisites not met', () => {
      const progress = makeProgress({ completedLessons: [] });
      expect(
        determineNodeStatus('mod-2', progress, ['mod-1'])
      ).toBe('locked');
    });

    it('returns in_progress when currentModuleId matches', () => {
      const progress = makeProgress({
        currentModuleId: 'mod-2',
        completedLessons: ['mod-1'],
      });
      expect(
        determineNodeStatus('mod-2', progress, ['mod-1'])
      ).toBe('in_progress');
    });

    it('returns available when prerequisites met', () => {
      const progress = makeProgress({ completedLessons: ['mod-1'] });
      expect(
        determineNodeStatus('mod-2', progress, ['mod-1'])
      ).toBe('available');
    });
  });

  describe('buildCourseFromJourney', () => {
    const mockJourney: CourseLearningJourney = {
      headline: 'Test Journey',
      levelLabel: 'Test Track',
      streakMessage: 'Keep going!',
      levels: [
        {
          id: 'level-1',
          title: 'Level 1',
          summary: 'First level',
          goal: 'Learn basics',
          tasks: [],
          resources: [],
        },
        {
          id: 'level-2',
          title: 'Level 2',
          summary: 'Second level',
          goal: 'Learn more',
          tasks: [],
          resources: [],
        },
      ],
    };

    it('builds nodes from journey levels', () => {
      const course = buildCourseFromJourney('course-1', mockJourney);
      expect(course.id).toBe('course-1');
      expect(course.nodes).toHaveLength(2);
      expect(course.nodes[0]!.title).toBe('Level 1');
      expect(course.nodes[1]!.title).toBe('Level 2');
    });

    it('builds edges between consecutive levels', () => {
      const course = buildCourseFromJourney('course-1', mockJourney);
      expect(course.edges).toHaveLength(1);
      expect(course.edges[0]!.source).toBe('level-1');
      expect(course.edges[0]!.target).toBe('level-2');
    });

    it('sets correct prerequisites on nodes', () => {
      const course = buildCourseFromJourney('course-1', mockJourney);
      expect(course.nodes[0]!.prerequisites).toEqual([]);
      expect(course.nodes[1]!.prerequisites).toEqual(['level-1']);
    });

    it('handles single level journey', () => {
      const singleLevel: CourseLearningJourney = {
        headline: 'Single',
        levelLabel: 'Single Track',
        streakMessage: 'Go!',
        levels: [
          {
            id: 'level-1',
            title: 'Level 1',
            summary: 'Only level',
            goal: 'Do it',
            tasks: [],
            resources: [],
          },
        ],
      };
      const course = buildCourseFromJourney('course-single', singleLevel);
      expect(course.nodes).toHaveLength(1);
      expect(course.edges).toHaveLength(0);
    });
  });

  describe('computeLayout', () => {
    const createNode = (
      id: string,
      level: number,
      order: number
    ): RoadmapNodeData => ({
      id,
      title: `Node ${id}`,
      description: '',
      status: 'locked',
      moduleId: id,
      order,
      level,
      children: [],
      prerequisites: [],
      progress: 0,
      taskCount: 0,
      completedTaskCount: 0,
    });

    it('computes vertical layout correctly', () => {
      const nodes = [createNode('a', 0, 0), createNode('b', 1, 0)];
      const layout = computeLayout(nodes, 'vertical');
      expect(layout.positions['a']).toBeDefined();
      expect(layout.positions['b']).toBeDefined();
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.height).toBeGreaterThan(0);
    });

    it('positions higher levels further down in vertical layout', () => {
      const nodes = [createNode('a', 0, 0), createNode('b', 1, 0)];
      const layout = computeLayout(nodes, 'vertical');
      expect(layout.positions['b']!.y).toBeGreaterThan(
        layout.positions['a']!.y
      );
    });

    it('handles horizontal layout', () => {
      const nodes = [createNode('a', 0, 0), createNode('b', 1, 0)];
      const layout = computeLayout(nodes, 'horizontal');
      expect(layout.positions['b']!.x).toBeGreaterThan(
        layout.positions['a']!.x
      );
    });

    it('handles empty nodes', () => {
      const layout = computeLayout([], 'vertical');
      expect(layout.positions).toEqual({});
      expect(layout.width).toBe(160);
      expect(layout.height).toBe(80);
    });

    it('centers nodes within levels', () => {
      const nodes = [
        createNode('a', 0, 0),
        createNode('b', 0, 1),
        createNode('c', 1, 0),
      ];
      const layout = computeLayout(nodes, 'vertical');
      const level0Nodes = ['a', 'b'];
      const yValues = level0Nodes.map((id) => layout.positions[id]!.y);
      expect(yValues[0]).toBe(yValues[1]);
    });
  });

  describe('groupByLevel', () => {
    it('groups nodes by level', () => {
      const nodes = [
        { ...createBaseNode('a'), level: 0 },
        { ...createBaseNode('b'), level: 1 },
        { ...createBaseNode('c'), level: 0 },
      ];
      const grouped = groupByLevel(nodes);
      expect(grouped[0]).toHaveLength(2);
      expect(grouped[1]).toHaveLength(1);
    });

    it('returns empty record for empty array', () => {
      expect(groupByLevel([])).toEqual({});
    });
  });

  describe('buildConnectorPath', () => {
    it('builds a cubic bezier path', () => {
      const source = { x: 0, y: 0 };
      const target = { x: 0, y: 140 };
      const path = buildConnectorPath(source, target);
      expect(path).toContain('M');
      expect(path).toContain('C');
      expect(path).toContain(String(NODE_DIMENSIONS.width / 2));
      expect(path).toContain(String(NODE_DIMENSIONS.height));
    });
  });

  describe('getAccessibleLabel', () => {
    it('generates descriptive label', () => {
      const node: RoadmapNodeData = {
        ...createBaseNode('test'),
        title: 'Smart Contracts',
        description: 'Learn Rust',
        progress: 50,
        completedTaskCount: 2,
        taskCount: 4,
      };
      const label = getAccessibleLabel(node);
      expect(label).toContain('Smart Contracts');
      expect(label).toContain('Locked');
      expect(label).toContain('50 percent');
      expect(label).toContain('2 of 4');
    });
  });

  describe('mergeProgressIntoNodes', () => {
    it('updates node statuses based on progress', () => {
      const nodes: RoadmapNodeData[] = [
        {
          ...createBaseNode('mod-1'),
          prerequisites: [],
        },
        {
          ...createBaseNode('mod-2'),
          prerequisites: ['mod-1'],
        },
      ];
      const progress: ProgressData = {
        completedLessons: ['mod-1'],
        currentModuleId: 'mod-2',
        percentage: 50,
        status: 'in_progress',
        lastAccessedAt: null,
        completedAt: null,
      };

      const merged = mergeProgressIntoNodes(nodes, progress);
      expect(merged[0]!.status).toBe('completed');
      expect(merged[1]!.status).toBe('in_progress');
    });

    it('handles null progress', () => {
      const nodes: RoadmapNodeData[] = [
        { ...createBaseNode('mod-1'), prerequisites: [] },
        { ...createBaseNode('mod-2'), prerequisites: ['mod-1'] },
      ];
      const merged = mergeProgressIntoNodes(nodes, null);
      expect(merged[0]!.status).toBe('available');
      expect(merged[1]!.status).toBe('locked');
    });
  });

  describe('generateCourseIdFromTitle', () => {
    it('converts title to kebab case', () => {
      expect(generateCourseIdFromTitle('Hello World')).toBe('hello-world');
      expect(generateCourseIdFromTitle('Test  Course')).toBe('test-course');
      expect(generateCourseIdFromTitle('  leading')).toBe('leading');
      expect(generateCourseIdFromTitle('trailing  ')).toBe('trailing');
    });
  });
});

function createBaseNode(id: string): RoadmapNodeData {
  return {
    id,
    title: `Node ${id}`,
    description: '',
    status: 'locked',
    moduleId: id,
    order: 0,
    level: 0,
    children: [],
    prerequisites: [],
    progress: 0,
    taskCount: 0,
    completedTaskCount: 0,
  };
}
