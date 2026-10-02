'use client';

import {
  useQuery,
  useQueryClient,
  useMutation,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import axios from 'axios';
import { queryKeys } from '@/lib/queryKeys';

export interface StudentProfile {
  id: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  walletAddress?: string;
  completedCourses?: number;
  certificateCount?: number;
  [key: string]: unknown;
}

async function fetchStudentProfile(studentId: string): Promise<StudentProfile> {
  const { data } = await axios.get<StudentProfile>(
    `/api/students/${encodeURIComponent(studentId)}/profile`,
  );
  return data;
}

export function useStudentProfile(
  studentId?: string,
): UseQueryResult<StudentProfile> {
  return useQuery<StudentProfile>({
    queryKey: queryKeys.studentProfile.detail(studentId ?? ''),
    queryFn: () => fetchStudentProfile(studentId as string),
    enabled: Boolean(studentId),
  });
}

export interface UpdateStudentProfileVariables {
  studentId: string;
  patch: Partial<StudentProfile>;
}

export function useUpdateStudentProfile(): UseMutationResult<
  StudentProfile,
  Error,
  UpdateStudentProfileVariables,
  { previous?: StudentProfile }
> {
  const queryClient = useQueryClient();

  return useMutation<
    StudentProfile,
    Error,
    UpdateStudentProfileVariables,
    { previous?: StudentProfile }
  >({
    mutationFn: async ({ studentId, patch }) => {
      const { data } = await axios.patch<StudentProfile>(
        `/api/students/${encodeURIComponent(studentId)}/profile`,
        patch,
      );
      return data;
    },
    onMutate: async (variables) => {
      const key = queryKeys.studentProfile.detail(variables.studentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<StudentProfile>(key);

      queryClient.setQueryData<StudentProfile>(key, (old) =>
        old ? { ...old, ...variables.patch } : old,
      );

      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.studentProfile.detail(variables.studentId),
          context.previous,
        );
      }
    },
    onSettled: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.studentProfile.detail(variables.studentId),
      });
    },
  });
}

export function usePrefetchStudentProfile() {
  const queryClient = useQueryClient();
  return useCallback(
    (studentId: string) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.studentProfile.detail(studentId),
        queryFn: () => fetchStudentProfile(studentId),
      }),
    [queryClient],
  );
}
