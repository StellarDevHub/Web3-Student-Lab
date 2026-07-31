import { apiRequestCache } from './api-cache';
import apiClient from './api-client';
import { API_BASE_URL } from './api-config';

export interface User {
  id: string;
  email: string;
  name: string;
  address?: string;
  walletAddress?: string | null;
  role?: 'student' | 'administrator' | 'instructor';
  roles?: Array<'student' | 'administrator' | 'instructor'>;
  permissions?: string[];
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  walletAddress?: string;
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  instructor: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}

export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  issuedAt: string;
  certificateHash?: string;
  status: string;
  student?: User;
  course?: Course;
}

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  status: string;
  student?: User;
  course?: Course;
}

export interface Feedback {
  id: string;
  studentId: string;
  courseId: string;
  rating: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
  student?: User;
  course?: Course;
}

export interface ExportJobResult {
  fileName: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface ExportJobStatus {
  id: string;
  state: string;
  progress: number;
  result?: ExportJobResult;
}

export interface ExportSseMessage {
  userId?: string;
  type?: 'EXPORT_PROGRESS' | 'EXPORT_COMPLETED' | 'EXPORT_FAILED';
  jobId?: string;
  progress?: number;
  stage?: string;
  result?: ExportJobResult;
  error?: string;
  timestamp?: string;
}

const DEFAULT_CACHE_TTL_MS = 15_000;

function normalizeCertificateListResponse(data: unknown): Certificate[] {
  if (Array.isArray(data)) {
    return data as Certificate[];
  }

  if (
    data &&
    typeof data === 'object' &&
    'certificates' in data &&
    Array.isArray((data as { certificates?: unknown }).certificates)
  ) {
    return (data as { certificates: Certificate[] }).certificates;
  }

  return [];
}

// Authentication APIs
export const authAPI = {
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/register', data, { encrypt: true } as any);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/login', data);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    return apiRequestCache.fetch(
      'auth:me',
      async () => {
        const response = await apiClient.get('/auth/me');
        return response.data.user;
      },
      { ttlMs: 10_000 }
    );
  },

  getProfileStatus: async (
    walletAddress: string
  ): Promise<{ completed: boolean; user: User | null }> => {
    return apiRequestCache.fetch(
      `auth:profile-status:${walletAddress}`,
      async () => {
        const response = await apiClient.get('/auth/profile-status', {
          params: { walletAddress },
        });
        return response.data;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  /**
   * Get the GitHub OAuth authorization URL to redirect the user
   */
  getGitHubOAuthUrl: (): string => {
    return `${API_BASE_URL}/oauth/github`;
  },

  /**
   * Check if the current user has a linked GitHub account
   */
  getGitHubStatus: async (): Promise<{
    linked: boolean;
    githubId?: number;
    githubUsername?: string;
    githubAvatarUrl?: string | null;
  }> => {
    const response = await apiClient.get('/oauth/github/status');
    return response.data;
  },

  /**
   * Link a GitHub account to the current user
   */
  linkGitHubAccount: async (code: string): Promise<AuthResponse> => {
    const response = await apiClient.post('/oauth/github/link', { code });
    return response.data;
  },
};

// A course list/detail response is either backed by the live database
// ("live") or, when the backend cannot reach the database, an
// explicitly labeled demo/fallback dataset ("demo"). See #911 — the
// backend never silently serves demo data as if it were live.
export type CourseDataSource = 'live' | 'demo';

export interface CoursesListResult {
  courses: Course[];
  dataSource: CourseDataSource;
  message?: string;
}

export interface CourseDetailResult {
  course: Course;
  dataSource: CourseDataSource;
  message?: string;
}

function normalizeCoursesResponse(data: unknown): CoursesListResult {
  if (data && typeof data === 'object' && 'courses' in (data as Record<string, unknown>)) {
    const d = data as { courses: Course[]; dataSource?: CourseDataSource; message?: string };
    return {
      courses: d.courses,
      dataSource: d.dataSource ?? 'live',
      message: d.message,
    };
  }
  // Backward-compatible shape (plain array) in case of stale caches.
  return { courses: (data as Course[]) ?? [], dataSource: 'live' };
}

function normalizeCourseResponse(data: unknown): CourseDetailResult {
  if (data && typeof data === 'object' && 'course' in (data as Record<string, unknown>)) {
    const d = data as { course: Course; dataSource?: CourseDataSource; message?: string };
    return {
      course: d.course,
      dataSource: d.dataSource ?? 'live',
      message: d.message,
    };
  }
  return { course: data as Course, dataSource: 'live' };
}

// Courses APIs
export const coursesAPI = {
  /**
   * Returns the course list along with an explicit `dataSource` flag
   * so callers can distinguish live data from the demo fallback shown
   * when the backend database is unreachable (#911).
   */
  getAllWithSource: async (): Promise<CoursesListResult> => {
    return apiRequestCache.fetch(
      'courses:list',
      async () => {
        const response = await apiClient.get('/courses');
        return normalizeCoursesResponse(response.data);
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getAll: async (): Promise<Course[]> => {
    const result = await coursesAPI.getAllWithSource();
    return result.courses;
  },

  getByIdWithSource: async (id: string): Promise<CourseDetailResult> => {
    return apiRequestCache.fetch(
      `courses:detail:${id}`,
      async () => {
        const response = await apiClient.get(`/courses/${id}`);
        return normalizeCourseResponse(response.data);
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getById: async (id: string): Promise<Course> => {
    const result = await coursesAPI.getByIdWithSource(id);
    return result.course;
  },

  create: async (data: Partial<Course>): Promise<Course> => {
    const response = await apiClient.post('/courses', data);
    apiRequestCache.invalidatePrefix('courses:');
    return response.data;
  },

  update: async (id: string, data: Partial<Course>): Promise<Course> => {
    const response = await apiClient.put(`/courses/${id}`, data);
    apiRequestCache.invalidate('courses:list');
    apiRequestCache.invalidate(`courses:detail:${id}`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/courses/${id}`);
    apiRequestCache.invalidate('courses:list');
    apiRequestCache.invalidate(`courses:detail:${id}`);
  },
};

// Certificates APIs
export const certificatesAPI = {
  issue: async (data: {
    studentId: string;
    courseId: string;
  }): Promise<{ success: boolean; certificate: Certificate; metadata?: unknown }> => {
    const response = await apiClient.post('/certificates', data);
    return response.data;
  },

  getAll: async (): Promise<Certificate[]> => {
    return apiRequestCache.fetch(
      'certificates:list',
      async () => {
        const response = await apiClient.get('/certificates');
        return response.data;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getByStudentId: async (studentId: string): Promise<Certificate[]> => {
    return apiRequestCache.fetch(
      `certificates:student:${studentId}`,
      async () => {
        const response = await apiClient.get(`/certificates/student/${studentId}`);
        return normalizeCertificateListResponse(response.data);
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getById: async (id: string): Promise<Certificate> => {
    return apiRequestCache.fetch(
      `certificates:detail:${id}`,
      async () => {
        const response = await apiClient.get(`/certificates/${id}`);
        return response.data as Certificate;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  verifyOnChain: async (
    tokenId: string
  ): Promise<{
    isValid: boolean;
    certificate?: unknown;
    onChainData?: unknown;
    message?: string;
  }> => {
    const response = await apiClient.get(`/certificates/verify/${tokenId}`);
    return response.data;
  },
};

// Enrollments APIs
export const enrollmentsAPI = {
  getAll: async (): Promise<Enrollment[]> => {
    return apiRequestCache.fetch(
      'enrollments:list',
      async () => {
        const response = await apiClient.get('/enrollments');
        return response.data;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getByStudentId: async (studentId: string): Promise<Enrollment[]> => {
    return apiRequestCache.fetch(
      `enrollments:student:${studentId}`,
      async () => {
        const response = await apiClient.get(`/enrollments/student/${studentId}`);
        return response.data;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  enroll: async (studentId: string, courseId: string): Promise<Enrollment> => {
    const response = await apiClient.post('/enrollments', {
      studentId,
      courseId,
    });
    apiRequestCache.invalidate('enrollments:list');
    apiRequestCache.invalidate(`enrollments:student:${studentId}`);
    return response.data;
  },

  updateStatus: async (id: string, status: string): Promise<Enrollment> => {
    const response = await apiClient.put(`/enrollments/${id}`, { status });
    apiRequestCache.invalidatePrefix('enrollments:');
    return response.data;
  },
};

// Feedback APIs
export interface FeedbackSummary {
  averageRating: number;
  totalReviews: number;
}

export const feedbackAPI = {
  submit: async (data: {
    courseId: string;
    rating: number;
    review?: string;
  }): Promise<Feedback> => {
    const response = await apiClient.post('/feedback', data);
    return response.data;
  },

  getByCourseId: async (courseId: string): Promise<Feedback[]> => {
    const response = await apiClient.get(`/feedback/course/${courseId}`);
    return response.data;
  },

  getSummary: async (courseId: string): Promise<FeedbackSummary> => {
    const response = await apiClient.get(`/feedback/course/${courseId}/summary`);
    return response.data;
  },
};

// Dashboard APIs

export interface DashboardStats {
  coursesCount: number;
  studentsCount: number;
  certificatesCount: number;
  verificationRate: string;
}

export interface StudentDashboard {
  userId: string;
  progress: Record<string, unknown>;
  certificates: Record<string, unknown>[];
  tokenBalance: Record<string, unknown>;
  recentActivity: string[];
}

export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/dashboard/stats');
    return response.data;
  },

  getStudentDashboard: async (studentId: string): Promise<StudentDashboard> => {
    const response = await apiClient.get(`/dashboard/student/${studentId}`);
    return response.data;
  },
};

// Analytics APIs
export interface AnalyticsOverview {
  learningProgress: unknown[];
  skillDistribution: unknown[];
  courseCompletion: unknown[];
  studyActivity: unknown[];
  performanceTrends: unknown[];
  timeDistribution: unknown[];
}

export const analyticsAPI = {
  getGlobalStats: async (): Promise<unknown> => {
    const response = await apiClient.get('/analytics/global-stats');
    return response.data;
  },

  getOverview: async (): Promise<AnalyticsOverview> => {
    const response = await apiClient.get('/analytics/overview');
    return response.data;
  },

  getUserAnalytics: async (userId: string): Promise<AnalyticsOverview> => {
    const response = await apiClient.get(`/analytics/user/${userId}`);
    return response.data;
  },

  subscribeToUpdates: (callback: (data: unknown) => void): WebSocket | null => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    const ws = new WebSocket(`${wsUrl}/analytics/stream?token=${token}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return ws;
  },
};

// Generator APIs
export interface ProjectIdea {
  title: string;
  description: string;
  keyFeatures: string[];
  recommendedTech: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface GeneratedIdeaResult {
  idea: ProjectIdea;
  /** True when the backend substituted a safe fallback idea instead of a live AI-generated one (#908). */
  fromMock: boolean;
  /** Machine-readable reason for the fallback, e.g. 'ai_service_unavailable' | 'generated_idea_rejected'. */
  fallbackReason?: string;
  /** Human-readable, actionable explanation suitable for display. */
  message?: string;
}

export const generatorAPI = {
  generateIdea: async (params: {
    theme: string;
    techStack: string[];
    difficulty: string;
  }): Promise<ProjectIdea> => {
    const response = await apiClient.post('/generator/generate', params);
    return response.data.projectIdea;
  },

  /**
   * Same endpoint as {@link generateIdea}, but surfaces whether the
   * backend had to fall back to a safe mock idea (AI unavailable, or
   * generated output rejected by server-side validation/safety
   * checks) so the UI can show an actionable message instead of
   * silently presenting a substituted idea as if it were freshly
   * generated (#908).
   */
  generateIdeaWithStatus: async (params: {
    theme: string;
    techStack: string[];
    difficulty: string;
  }): Promise<GeneratedIdeaResult> => {
    const response = await apiClient.post('/generator/generate', params);
    const data = response.data as {
      projectIdea: ProjectIdea;
      fromMock?: boolean;
      fallbackReason?: string;
      message?: string;
    };
    return {
      idea: data.projectIdea,
      fromMock: Boolean(data.fromMock),
      fallbackReason: data.fallbackReason,
      message: data.message,
    };
  },
};

export const exportAPI = {
  start: async (data: {
    type: 'students' | 'audit' | 'courses';
    format: 'csv' | 'json';
  }): Promise<{ jobId: string }> => {
    const response = await apiClient.post('/export', data);
    return response.data;
  },

  getStatus: async (jobId: string): Promise<ExportJobStatus> => {
    const response = await apiClient.get(`/export/${jobId}/status`);
    return response.data;
  },

  openStatusStream: (): EventSource => {
    const token = localStorage.getItem('token');

    if (!token) {
      throw new Error('Missing auth token for SSE connection');
    }

    const streamUrl = new URL(`${API_BASE_URL}/export/events`);
    streamUrl.searchParams.set('access_token', token);

    return new EventSource(streamUrl.toString());
  },
};

export const api = apiClient;

export interface ActivityEntry {
  date: string;
  count: number;
  labs?: number;
}

export const activityAPI = {
  getStudentActivity: async (userId: string): Promise<ActivityEntry[]> => {
    const response = await apiClient.get(`/activity/user/${userId}`);
    return response.data;
  },
};

export interface VestingSchedule {
  id: string;
  workspaceId: string;
  projectId: string;
  tokenName: string;
  tokenSymbol: string;
  amount: number;
  cliffMonths: number;
  durationMonths: number;
  beneficiary: string;
  claimedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export const vestingAPI = {
  create: async (data: Omit<VestingSchedule, 'id' | 'workspaceId' | 'claimedAmount' | 'createdAt' | 'updatedAt'>): Promise<VestingSchedule> => {
    try {
      const response = await apiClient.post('/generator/vesting', data);
      return response.data;
    } catch (err) {
      const schedule: VestingSchedule = {
        ...data,
        id: `local-${Math.random().toString(36).substring(2, 9)}`,
        workspaceId: 'local',
        claimedAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(`vesting_schedule_${data.projectId}`, JSON.stringify(schedule));
      }
      return schedule;
    }
  },

  getByProjectId: async (projectId: string): Promise<VestingSchedule> => {
    try {
      const response = await apiClient.get(`/generator/vesting/${projectId}`);
      return response.data;
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem(`vesting_schedule_${projectId}`);
        if (local) {
          return JSON.parse(local);
        }
      }
      throw err;
    }
  },

  list: async (): Promise<VestingSchedule[]> => {
    try {
      const response = await apiClient.get('/generator/vesting');
      return response.data;
    } catch (err) {
      const list: VestingSchedule[] = [];
      if (typeof window !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('vesting_schedule_')) {
            const item = localStorage.getItem(key);
            if (item) list.push(JSON.parse(item));
          }
        }
      }
      return list;
    }
  },

  claim: async (projectId: string, amount: number, simulatedMonthsElapsed?: number): Promise<VestingSchedule> => {
    try {
      const response = await apiClient.post(`/generator/vesting/${projectId}/claim`, {
        amount,
        simulatedMonthsElapsed,
      });
      return response.data;
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem(`vesting_schedule_${projectId}`);
        if (local) {
          const schedule: VestingSchedule = JSON.parse(local);
          schedule.claimedAmount = (schedule.claimedAmount || 0) + amount;
          schedule.updatedAt = new Date().toISOString();
          localStorage.setItem(`vesting_schedule_${projectId}`, JSON.stringify(schedule));
          return schedule;
        }
      }
      throw err;
    }
  },
};
