'use client';

import {
  useQuery,
  useQueryClient,
  useMutation,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import axios from 'axios';
import { queryKeys } from '@/lib/queryKeys';

export interface Course {
  id: string;
  title: string;
  description?: string;
  instructor?: string;
  progress?: number;
  enrolled?: boolean;
  thumbnailUrl?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CoursesResponse {
  courses: Course[];
}

export interface CoursesParams {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown | undefined;
}

async function fetchCourses(params: CoursesParams): Promise<CoursesResponse> {
  const { data } = await axios.get<CoursesResponse>('/api/courses', { params });
  return data;
}

export function useCourses(params: CoursesParams = {}): UseQueryResult<CoursesResponse> {
  return useQuery<CoursesResponse>({ // eslint-disable-line @tanstack/query/eslint-plugin/exhaustive-deps
    queryKey: queryKeys.courses.list(params),
    queryFn: () => fetchCourses(params),
    placeholderData: (cache) => {
      const existing = cache.getQueriesData<CoursesResponse>(queryKeys.courses.list());
      return existing;
    },
  });
}

export interface UpdateCourseVariables {
  id: string;
  patch: Partial<Course>;
}

export function useUpdateCourse(): UseMutationResult<Course, Error, UpdateCourseVariables, { previousList?: CoursesResponse }> {
  const queryClient = useQueryClient();

  return useMutation<Course, Error, UpdateCourseVariables, { previousList?: CoursesResponse }>({
    mutationFn: async ({ patch }) => {
      const { data } = await axios.patch<Course>('/api/courses', patch);
      return data;
    },
    onMutate: async (variables) => {
      const listKey = queryKeys.courses.list();
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousList = queryClient.getQueryData<CoursesResponse>(listKey);

      queryClient.setQueryData<CoursesResponse>(listKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          courses: old.courses.map((course) =>
            course.id === variables.id ? { ...course, ...variables.patch } : course,
          ),
        };
      });

      queryClient.setQueryData<Course>(queryKeys.courses.detail(variables.id), (old) =>
        old ? { ...old, ...variables.patch } : old,
      );

      return { previousList };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.courses.list(), context.previousList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
}

export function useCourseMutations() {
  const updateCourse = useUpdateCourse();
  return useMemo(() => ({ updateCourse }), [updateCourse]);
}

export function usePrefetchCourses() {
  const queryClient = useQueryClient();
  return useCallback(
    (params: CoursesParams = {}) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.courses.list(params),
        queryFn: () => fetchCourses(params),
      }),
    [queryClient],
  );
}
