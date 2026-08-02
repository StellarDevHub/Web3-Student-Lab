'use client';

import { useAuth } from '@/contexts/AuthContext';
import type { ComponentType, ReactNode } from 'react';
import { useMemo } from 'react';

export type AppRole = 'student' | 'administrator' | 'instructor';

export interface AuthorizationProfile {
  roles: AppRole[];
  permissions: string[];
}

export interface RoleGuardProps {
  requiredRoles?: AppRole[];
  requiredPermissions?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

function normalizeRoles(rawUser: unknown): AppRole[] {
  if (!rawUser || typeof rawUser !== 'object') {
    return ['student'];
  }

  const user = rawUser as {
    role?: string;
    roles?: string[];
  };

  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles.filter(Boolean) as AppRole[];
  }

  if (typeof user.role === 'string' && user.role.length > 0) {
    return [user.role as AppRole];
  }

  return ['student'];
}

function normalizePermissions(rawUser: unknown): string[] {
  if (!rawUser || typeof rawUser !== 'object') {
    return [];
  }

  const user = rawUser as {
    permissions?: string[];
  };

  return Array.isArray(user.permissions) ? user.permissions.filter(Boolean) : [];
}

export function buildAuthorizationProfile(user: unknown): AuthorizationProfile {
  return {
    roles: normalizeRoles(user),
    permissions: normalizePermissions(user),
  };
}

function isAuthorized(
  profile: AuthorizationProfile,
  requiredRoles: AppRole[],
  requiredPermissions: string[]
): boolean {
  const hasRole = requiredRoles.length === 0 || requiredRoles.some((role) => profile.roles.includes(role));
  const hasPermissions =
    requiredPermissions.length === 0 ||
    requiredPermissions.every((permission) => profile.permissions.includes(permission));

  return hasRole && hasPermissions;
}

export function AccessDeniedView() {
  return (
    <div role="alert" className="mx-auto my-10 max-w-2xl rounded-3xl border border-rose-300 bg-rose-50 p-8 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-700">Access denied</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-rose-950">This simulator view is restricted</h2>
      <p className="mt-3 text-sm text-rose-900">
        Your current account does not have the required permissions for this route. Sign in with an
        administrator profile or request simulator access from the platform team.
      </p>
    </div>
  );
}

export function RoleGuard({
  requiredRoles = [],
  requiredPermissions = [],
  fallback,
  children,
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  const profile = useMemo(() => buildAuthorizationProfile(user), [user]);

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="p-6 text-sm text-[var(--muted)]">
        Checking permissions...
      </div>
    );
  }

  if (!isAuthorized(profile, requiredRoles, requiredPermissions)) {
    return <>{fallback ?? <AccessDeniedView />}</>;
  }

  return <>{children}</>;
}

export function withRoleGuard<P extends object>(
  WrappedComponent: ComponentType<P>,
  guard: Omit<RoleGuardProps, 'children'>
) {
  const GuardedComponent = (props: P) => (
    <RoleGuard {...guard}>
      <WrappedComponent {...props} />
    </RoleGuard>
  );

  GuardedComponent.displayName = `WithRoleGuard(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return GuardedComponent;
}
