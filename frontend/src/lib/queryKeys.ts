export const queryKeys = {
  courses: {
    all: ['courses'] as const,
    list: (params?: Record<string, unknown>) =>
      params ? ([...queryKeys.courses.all, 'list', params] as const) : ([...queryKeys.courses.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.courses.all, 'detail', id] as const,
  },
  certificates: {
    all: ['certificates'] as const,
    list: (studentId?: string) =>
      studentId
        ? ([...queryKeys.certificates.all, 'list', studentId] as const)
        : ([...queryKeys.certificates.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.certificates.all, 'detail', id] as const,
  },
  studentProfile: {
    all: ['studentProfile'] as const,
    detail: (studentId: string) =>
      [...queryKeys.studentProfile.all, 'detail', studentId] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
