export interface RateLimitProfile {
  burst: {
    windowMs: number;
    max: number;
  };
  sustained: {
    windowMs: number;
    max: number;
  };
}

export interface RateLimitRule {
  name: string;
  priority: number;
  match: (path: string, method: string) => boolean;
  profile: RateLimitProfile;
}

const DEFAULT_PROFILE: RateLimitProfile = {
  burst: { windowMs: 1000, max: 20 },
  sustained: { windowMs: 60_000, max: 200 },
};

const AUTH_PROFILE: RateLimitProfile = {
  burst: { windowMs: 1000, max: 80 },
  sustained: { windowMs: 60_000, max: 600 },
};

const ADMIN_PROFILE: RateLimitProfile = {
  burst: { windowMs: 1000, max: 200 },
  sustained: { windowMs: 60_000, max: 2000 },
};

const rules: RateLimitRule[] = [
  {
    name: 'auth-profile-status',
    priority: 100,
    match: (path) => path.includes('/auth/profile-status'),
    profile: { burst: { windowMs: 1000, max: 30 }, sustained: { windowMs: 60_000, max: 120 } },
  },
  {
    name: 'auth-login',
    priority: 90,
    match: (path, method) => path.includes('/auth/login') && method === 'POST',
    profile: { burst: { windowMs: 1000, max: 5 }, sustained: { windowMs: 60_000, max: 20 } },
  },
  {
    name: 'auth-register',
    priority: 89,
    match: (path, method) => path.includes('/auth/register') && method === 'POST',
    profile: { burst: { windowMs: 1000, max: 3 }, sustained: { windowMs: 60_000, max: 10 } },
  },
  {
    name: 'read-heavy',
    priority: 80,
    match: (path) => {
      const readHeavy = ['/certificates', '/enrollments', '/courses'];
      return readHeavy.some((prefix) => path.includes(prefix));
    },
    profile: { burst: { windowMs: 1000, max: 120 }, sustained: { windowMs: 60_000, max: 1000 } },
  },
  {
    name: 'security',
    priority: 75,
    match: (path) => path.includes('/security'),
    profile: { burst: { windowMs: 1000, max: 10 }, sustained: { windowMs: 60_000, max: 60 } },
  },
  {
    name: 'generator',
    priority: 70,
    match: (path) => path.includes('/generator'),
    profile: { burst: { windowMs: 1000, max: 50 }, sustained: { windowMs: 60_000, max: 200 } },
  },
  {
    name: 'export',
    priority: 65,
    match: (path) => path.includes('/export'),
    profile: { burst: { windowMs: 1000, max: 3 }, sustained: { windowMs: 60_000, max: 15 } },
  },
  {
    name: 'contracts',
    priority: 60,
    match: (path) => path.includes('/contracts'),
    profile: { burst: { windowMs: 1000, max: 15 }, sustained: { windowMs: 60_000, max: 100 } },
  },
  {
    name: 'quiz-submission',
    priority: 55,
    match: (path, method) => path.includes('/quiz') && method === 'POST',
    profile: { burst: { windowMs: 1000, max: 10 }, sustained: { windowMs: 60_000, max: 50 } },
  },
  {
    name: 'playground-compile',
    priority: 50,
    match: (path, method) => path.includes('/playground') && (method === 'POST' || method === 'PUT'),
    profile: { burst: { windowMs: 1000, max: 5 }, sustained: { windowMs: 60_000, max: 30 } },
  },
];

let envOverrides: Partial<Record<string, RateLimitProfile>> = {};

export function setRateLimitEnvOverrides(overrides: Partial<Record<string, RateLimitProfile>>): void {
  envOverrides = overrides;
}

export function resolveRateLimit(path: string, method: string, isAuthenticated: boolean, isAdmin: boolean): RateLimitProfile {
  for (const rule of rules) {
    if (rule.match(path, method)) {
      const override = envOverrides[rule.name];
      if (override) {
        return override;
      }
      return rule.profile;
    }
  }

  if (isAdmin) return ADMIN_PROFILE;
  if (isAuthenticated) return AUTH_PROFILE;
  return DEFAULT_PROFILE;
}

export function getRateLimitProfile(path: string, method: string, user?: { id: string; role?: string }): RateLimitProfile & { isAuthenticated: boolean; isAdmin: boolean } {
  const isAuthenticated = !!user;
  const isAdmin = isAuthenticated && user?.role === 'admin';
  const profile = resolveRateLimit(path, method, isAuthenticated, isAdmin);
  return { ...profile, isAuthenticated, isAdmin };
}
