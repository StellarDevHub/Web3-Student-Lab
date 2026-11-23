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
import { learningAPI, ProgressUnavailableError, ProgressConflictError } from '@/lib/learning-api';
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

      const previousProgress = progress;

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
        updatedAt: progress?.updatedAt ?? null,
      };

      const totalLessons = roadmapCourse?.nodes.length ?? 1;
      updatedProgress.percentage = Math.round(
        (updatedProgress.completedLessons.length / totalLessons) * 100
      );
      if (updatedProgress.percentage >= 100) {
        updatedProgress.status = 'completed';
        updatedProgress.completedAt = new Date().toISOString();
      } else if (updatedProgress.completedLessons.length === 0) {
        updatedProgress.status = 'not_started';
      }

      // Optimistic UI update — rolled back below if persistence fails so a
      // failed save never leaves the UI falsely marked complete (#901).
      setProgress(updatedProgress);
      learningAPI.saveLocalProgress(course.id, updatedProgress);

      if (completed) {
        completeModule(moduleId);
      }

      try {
        const saved = await learningAPI.updateProgress(course.id, {
          completedLessons: updatedProgress.completedLessons,
          currentModuleId: updatedProgress.currentModuleId,
          percentage: updatedProgress.percentage,
          status: updatedProgress.status,
          baseUpdatedAt: previousProgress?.updatedAt ?? null,
        });

        if (saved) {
          // Reconcile with the authoritative server snapshot (carries the
          // fresh `updatedAt` token used for the next write).
          const reconciled = learningAPI.convertToProgressData(saved);
          setProgress(reconciled);
          learningAPI.saveLocalProgress(course.id, reconciled);
          setError(null);
        } else {
          throw new Error('Progress could not be saved');
        }
      } catch (err) {
        if (err instanceof ProgressConflictError) {
          // Deterministic stale/concurrent behavior (#901): the server is
          // authoritative — refetch and reflect stored state, then tell the
          // learner to reconcile.
          setError(err.message);
          if (err.current) {
            const serverProgress = learningAPI.convertToProgressData(
              err.current
            );
            setProgress(serverProgress);
            learningAPI.saveLocalProgress(course.id, serverProgress);
          } else {
            await fetchProgress();
          }
          return;
        }

        // Roll back the optimistic update so the UI does not show a
        // completion that was never persisted.
        setProgress(previousProgress);
        if (previousProgress) {
          learningAPI.saveLocalProgress(course.id, previousProgress);
        }
        setError(
          err instanceof ProgressUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to save progress'
        );
      }
    },
    [course, progress, roadmapCourse, completeModule, fetchProgress]
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
