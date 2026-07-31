'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  RoadmapCourse,
  RoadmapNodeData,
  ProgressData,
  NodeStatus,
} from '@/lib/types/roadmap';
import {
  buildCourseFromJourney,
  mergeProgressIntoNodes,
  computeLayout,
} from '@/lib/roadmap-utils';
import { getLearningJourney, getStoredLearningJourney } from '@/lib/learning-journey';
import { learningAPI, ProgressUnavailableError } from '@/lib/learning-api';
import { useUserStore } from '@/stores/userStore';
import type { Course } from '@/lib/api';

export interface UseRoadmapProgressReturn {
  course: RoadmapCourse | null;
  nodes: RoadmapNodeData[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  progress: ProgressData | null;
  loading: boolean;
  error: string | null;
  overallProgress: number;
  courseTitle: string;
  selectNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  refetch: () => Promise<void>;
  updateNodeProgress: (
    moduleId: string,
    completed: boolean
  ) => Promise<void>;
}

export function useRoadmapProgress(
  course: Course | null
): UseRoadmapProgressReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<RoadmapNodeData[]>([]);

  const completeModule = useUserStore((state) => state.completeModule);
  const completedModules = useUserStore(
    (state) => state.learningPath.completedModules
  );

  const roadmapCourse = useMemo(() => {
    if (!course) return null;
    const journey =
      getStoredLearningJourney(course.id) ||
      getLearningJourney(course);
    return buildCourseFromJourney(course.id, journey);
  }, [course]);

  const courseTitle = course?.title ?? 'Learning Roadmap';

  const fetchProgress = useCallback(async () => {
    if (!course) {
      setProgress(null);
      setNodes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let progressData: ProgressData | null = null;

      const apiProgress = await learningAPI.getProgress(course.id);
      if (apiProgress) {
        progressData = learningAPI.convertToProgressData(apiProgress);
        learningAPI.saveLocalProgress(course.id, progressData);
      } else {
        progressData = learningAPI.getLocalProgressFallback(course.id);
      }

      setProgress(progressData);
    } catch (err) {
      const fallback = learningAPI.getLocalProgressFallback(
        course.id
      );
      if (fallback) {
        setProgress(fallback);
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load progress'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [course]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  useEffect(() => {
    if (!roadmapCourse) {
      setNodes([]);
      return;
    }

    const merged = mergeProgressIntoNodes(
      roadmapCourse.nodes,
      progress
    );
    setNodes(merged);
  }, [roadmapCourse, progress]);

  useEffect(() => {
    if (nodes.length > 0 && !selectedNodeId) {
      const firstInProgress =
        nodes.find((n) => n.status === 'in_progress') ||
        nodes.find((n) => n.status === 'available') ||
        nodes[0];
      if (firstInProgress) {
        setSelectedNodeId(firstInProgress.id);
      }
    }
  }, [nodes, selectedNodeId]);

  const overallProgress = useMemo(() => {
    if (!progress) return 0;
    return progress.percentage;
  }, [progress]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const updateNodeProgress = useCallback(
    async (moduleId: string, completed: boolean) => {
      if (!course) return;

      const updatedProgress: ProgressData = {
        completedLessons: completed
          ? [...(progress?.completedLessons ?? []), moduleId]
          : (progress?.completedLessons ?? []).filter(
              (id) => id !== moduleId
            ),
        currentModuleId: progress?.currentModuleId ?? moduleId,
        percentage: 0,
        status: 'in_progress',
        lastAccessedAt: new Date().toISOString(),
        completedAt: progress?.completedAt ?? null,
      };

      const totalLessons = roadmapCourse?.nodes.length ?? 1;
      updatedProgress.percentage = Math.round(
        (updatedProgress.completedLessons.length / totalLessons) * 100
      );
      if (updatedProgress.percentage >= 100) {
        updatedProgress.status = 'completed';
        updatedProgress.completedAt = new Date().toISOString();
      }

      setProgress(updatedProgress);

      if (completed) {
        completeModule(moduleId);
      }

      learningAPI.saveLocalProgress(course.id, updatedProgress);

      try {
        await learningAPI.updateProgress(course.id, updatedProgress);
      } catch (err) {
        if (err instanceof ProgressUnavailableError) {
          // Local/offline progress was saved above, but the learner
          // must be told their progress was NOT recorded server-side —
          // never claim a save succeeded when it didn't (#911).
          setError(err.message);
        } else {
          throw err;
        }
      }
    },
    [course, progress, roadmapCourse, completeModule]
  );

  const refetch = useCallback(async () => {
    await fetchProgress();
  }, [fetchProgress]);

  return {
    course: roadmapCourse,
    nodes,
    selectedNodeId,
    hoveredNodeId,
    progress,
    loading,
    error,
    overallProgress,
    courseTitle,
    selectNode,
    setHoveredNode: setHoveredNodeId,
    refetch,
    updateNodeProgress,
  };
}
