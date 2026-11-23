import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoleGuard } from '../RoleGuard';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/AuthContext';

const mockedUseAuth = vi.mocked(useAuth);

describe('RoleGuard', () => {
  it('renders children for a student route when user is student', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'student@example.com', name: 'Student', role: 'student' },
      isLoading: false,
    } as any);

    render(
      <RoleGuard requiredRoles={['student']}>
        <div>Student Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('Student Content')).toBeInTheDocument();
  });

  it('renders fallback for administrator route when user is student', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'student@example.com', name: 'Student', role: 'student' },
      isLoading: false,
    } as any);

    render(
      <RoleGuard
        requiredRoles={['administrator']}
        fallback={<div>No Access</div>}
      >
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('allows administrator to access protected route', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '2', email: 'admin@example.com', name: 'Admin', role: 'administrator' },
      isLoading: false,
    } as any);

    render(
      <RoleGuard requiredRoles={['administrator']}>
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('blocks when required permissions are missing', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: '1',
        email: 'student@example.com',
        name: 'Student',
        role: 'student',
        permissions: ['simulator.read'],
      },
      isLoading: false,
    } as any);

    render(
      <RoleGuard
        requiredPermissions={['simulator.read', 'simulator.manage']}
        fallback={<div>Permission Missing</div>}
      >
        <div>Protected Simulator</div>
      </RoleGuard>
    );

    expect(screen.getByText('Permission Missing')).toBeInTheDocument();
  });
});
