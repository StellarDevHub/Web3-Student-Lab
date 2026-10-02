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

export interface Certificate {
  id: string;
  courseId: string;
  courseTitle?: string;
  studentId?: string;
  issuedAt?: string;
  txHash?: string;
  status?: 'pending' | 'issued' | 'revoked';
  [key: string]: unknown;
}

export interface CertificatesResponse {
  certificates: Certificate[];
}

async function fetchCertificates(studentId?: string): Promise<CertificatesResponse> {
  const { data } = await axios.get<CertificatesResponse>('/api/certificates', {
    params: studentId ? { studentId } : undefined,
  });
  return data;
}

export function useCertificates(studentId?: string): UseQueryResult<CertificatesResponse> {
  return useQuery<CertificatesResponse>({
    queryKey: queryKeys.certificates.list(studentId),
    queryFn: () => fetchCertificates(studentId),
    enabled: Boolean(studentId),
    placeholderData: (cache) => {
      const existing = cache.getQueriesData<CertificatesResponse>(
        queryKeys.certificates.list(),
      );
      return existing;
    },
  });
}

export interface IssueCertificateVariables {
  courseId: string;
  studentId: string;
  courseTitle?: string;
}

export function useIssueCertificate(): UseMutationResult<
  Certificate,
  Error,
  IssueCertificateVariables,
  { previousList?: CertificatesResponse }
> {
  const queryClient = useQueryClient();

  return useMutation<
    Certificate,
    Error,
    IssueCertificateVariables,
    { previousList?: CertificatesResponse }
  >({
    mutationFk: async (variables) => {
      const { data } = await axios.post<Certificate>('/api/certificates', variables);
      return data;
    },
    onMutate: async (variables) => {
      const listKey = queryKeys.certificates.list(variables.studentId);
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousList = queryClient.getQueryData<CertificatesResponse>(listKey);

      const optimisticId = `optimistic-${variables.courseId}-${Date.now()}`;
      const optimisticCertificate: Certificate = {
        id: optimisticId,
        courseId: variables.courseId,
        courseTitle: variables.courseTitle,
        studentId: variables.studentId,
        status: 'pending',
        issuedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<CertificatesResponse>(listKey, (old) => {
        if (!old) return { certificates: [optimisticCertificate] };
        return { ...old, certificates: [optimisticCertificate, ...old.certificates] };
      });

      return { previousList };
    },
    onError: (_error, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(
          queryKeys.certificates.list(variables.studentId),
          context.previousList,
        );
      }
    },
    onSettled: (_data, _variables, context) => {
      if (context?.previousList) {
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all });
      }
    },
  });
}

export function usePrefetchCertificates() {
  const queryClient = useQueryClient();
  return useCallback(
    (studentId?: string) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.certificates.list(studentId),
        queryFn: () => fetchCertificates(studentId),
      }),
    [queryClient],
  );
}
