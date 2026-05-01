import { useEffect, useState } from "react";
import apiClient from "@/lib/api-client";

export interface AnalyticsData {
  learningProgress: ProgressDataPoint[];
  skillDistribution: SkillDataPoint[];
  courseCompletion: CompletionDataPoint[];
  studyActivity: ActivityDataPoint[];
  performanceTrends: TrendDataPoint[];
  timeDistribution: TimeDataPoint[];
}

export interface ProgressDataPoint {
  date: string;
  completed: number;
  inProgress: number;
  notStarted: number;
}

export interface SkillDataPoint {
  skill: string;
  level: number;
  maxLevel: number;
}

export interface CompletionDataPoint {
  name: string;
  value: number;
  color: string;
}

export interface ActivityDataPoint {
  date: string;
  count: number;
  intensity: number;
}

export interface TrendDataPoint {
  week: string;
  score: number;
  velocity: number;
}

export interface TimeDataPoint {
  hour: string;
  sessions: number;
}

export function useAnalytics(userId?: string) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setIsLoading(true);
        const response = await apiClient.get(
          userId ? `/analytics/user/${userId}` : "/analytics/overview"
        );
        setData(response.data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
  }, [userId]);

  return { data, isLoading, error };
}
