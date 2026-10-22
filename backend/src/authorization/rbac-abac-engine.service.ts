import { Injectable, Logger, ForbiddenException } from '@nestjs/common';

/**
 * BE-035: Granular Role-Based Access Control (RBAC) with ABAC Policy Engine.
 * Supports complex multi-role workflows with attribute-based conditions.
 */
@Injectable()
export class RbacAbacEngineService {
  private readonly logger = new Logger(RbacAbacEngineService.name);

  // Role hierarchy - higher index = more permissions
  private readonly roleHierarchy: Record<string, number> = {
    student: 1,
    ta: 2,
    instructor: 3,
    auditor: 2,
    admin: 4,
  };

  // Permission mappings per role
  private readonly rolePermissions: Record<string, Set<string>> = {
    student: new Set([
      'course.view',
      'assignment.submit',
      'grade.view_own',
      'profile.edit_own',
      'forum.post',
    ]),
    ta: new Set([
      'course.view',
      'assignment.view_all',
      'assignment.grade',
      'grade.view_all',
      'student.view_list',
      'forum.moderate',
      'feedback.create',
    ]),
    instructor: new Set([
      'course.view',
      'course.edit',
      'assignment.create',
      'assignment.view_all',
      'assignment.grade',
      'grade.view_all',
      'student.view_list',
      'forum.manage',
      'feedback.view_all',
      'certificate.issue',
    ]),
    auditor: new Set([
      'course.view',
      'assignment.view_all',
      'grade.view_all',
      'student.view_list',
      'forum.view',
    ]),
    admin: new Set([
      // Admin has all permissions
      '*',
    ]),
  };

  // ABAC policies
  private readonly abacPolicies: Array<{
    name: string;
    condition: (context: any) => boolean;
    allowedActions: string[];
  }> = [
    {
      name: 'student_own_grade_policy',
      condition: (ctx) =>
        ctx.user.role === 'student' && ctx.targetUserId === ctx.user.id,
      allowedActions: ['grade.view_own'],
    },
    {
      name: 'ta_assigned_course_policy',
      condition: (ctx) =>
        ctx.user.role === 'ta' && ctx.user.assignedCourses?.includes(ctx.courseId),
      allowedActions: ['assignment.grade', 'grade.view_all', 'feedback.create'],
    },
    {
      name: 'instructor_own_course_policy',
      condition: (ctx) =>
        ctx.user.role === 'instructor' && ctx.user.ownedCourses?.includes(ctx.courseId),
      allowedActions: [
        'course.edit',
        'assignment.create',
        'assignment.grade',
        'certificate.issue',
      ],
    },
    {
      name: 'time_based_submission_policy',
      condition: (ctx) => {
        const now = new Date();
        return ctx.assignment?.deadlineExtension?.includes(ctx.user.id) &&
          now < new Date(ctx.assignment.deadline)
          ? true
          : now < new Date(ctx.assignment.deadline);
      },
      allowedActions: ['assignment.submit'],
    },
    {
      name: 'auditor_readonly_policy',
      condition: (ctx) => ctx.user.role === 'auditor',
      allowedActions: ['course.view', 'assignment.view_all', 'grade.view_all'],
    },
  ];

  /**
   * Check if user has permission to perform action
   */
  hasPermission(
    userId: string,
    userRole: string,
    action: string,
    context?: any,
  ): boolean {
    // Admin bypass
    if (userRole === 'admin') {
      return true;
    }

    // Check role-based permissions
    const permissions = this.rolePermissions[userRole] || new Set();
    if (permissions.has('*') || permissions.has(action)) {
      return true;
    }

    // Check ABAC policies
    if (context) {
      context.user = { id: userId, role: userRole };
      const matchingPolicies = this.abacPolicies.filter(
        (policy) =>
          policy.condition(context) && policy.allowedActions.includes(action),
      );

      if (matchingPolicies.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enforce permission - throw if denied
   */
  enforcePermission(
    userId: string,
    userRole: string,
    action: string,
    context?: any,
  ): void {
    if (!this.hasPermission(userId, userRole, action, context)) {
      this.logger.warn(
        `Permission denied: User ${userId} (${userRole}) attempted action ${action}`,
      );
      throw new ForbiddenException(`Permission denied for action: ${action}`);
    }
  }

  /**
   * Get all permissions for a user
   */
  getUserPermissions(userRole: string, context?: any): string[] {
    const rolePermissions = Array.from(this.rolePermissions[userRole] || new Set());

    if (!context) {
      return rolePermissions;
    }

    // Add ABAC-granted permissions
    const abacPermissions: string[] = [];
    for (const policy of this.abacPolicies) {
      if (policy.condition(context)) {
        abacPermissions.push(...policy.allowedActions);
      }
    }

    return Array.from(new Set([...rolePermissions, ...abacPermissions]));
  }

  /**
   * Create custom role with specific permissions
   */
  createCustomRole(
    roleName: string,
    baseRole: string,
    additionalPermissions: string[] = [],
    deniedPermissions: string[] = [],
  ): void {
    const basePermissions = new Set(
      this.rolePermissions[baseRole] || new Set(),
    );

    // Add additional permissions
    for (const perm of additionalPermissions) {
      basePermissions.add(perm);
    }

    // Remove denied permissions
    for (const perm of deniedPermissions) {
      basePermissions.delete(perm);
    }

    this.rolePermissions[roleName] = basePermissions;
    this.logger.log(`Custom role created: ${roleName}`);
  }

  /**
   * Check resource ownership
   */
  isResourceOwner(userId: string, resourceOwnerId: string): boolean {
    return userId === resourceOwnerId;
  }

  /**
   * Check if user is in organization
   */
  isInOrganization(userId: string, organizationId: string, userOrganizations: string[]): boolean {
    return userOrganizations?.includes(organizationId) || false;
  }

  /**
   * Check bulk permissions
   */
  checkBulkPermissions(
    userId: string,
    userRole: string,
    actions: string[],
    context?: any,
  ): Record<string, boolean> {
    const results: Record<string, boolean> = {};

    for (const action of actions) {
      results[action] = this.hasPermission(userId, userRole, action, context);
    }

    return results;
  }

  /**
   * Get audit trail of permission decisions
   */
  getPermissionAuditTrail(
    userId: string,
    userRole: string,
    action: string,
    allowed: boolean,
    context?: any,
  ): {
    userId: string;
    userRole: string;
    action: string;
    allowed: boolean;
    reason: string;
    timestamp: Date;
  } {
    let reason = '';

    if (userRole === 'admin') {
      reason = 'Admin bypass';
    } else if (this.rolePermissions[userRole]?.has(action)) {
      reason = `Granted by role: ${userRole}`;
    } else if (context) {
      const matchingPolicy = this.abacPolicies.find(
        (p) =>
          p.condition(context) && p.allowedActions.includes(action),
      );
      if (matchingPolicy) {
        reason = `Granted by ABAC policy: ${matchingPolicy.name}`;
      } else {
        reason = 'No matching policies';
      }
    } else {
      reason = 'Permission not granted';
    }

    return {
      userId,
      userRole,
      action,
      allowed,
      reason,
      timestamp: new Date(),
    };
  }

  /**
   * Evaluate complex permission scenario
   */
  evaluateComplexScenario(scenario: {
    userId: string;
    userRole: string;
    action: string;
    courseId?: string;
    assignedCourses?: string[];
    ownedCourses?: string[];
    targetUserId?: string;
    assignment?: {
      deadline: string;
      deadlineExtension?: string[];
    };
  }): boolean {
    return this.hasPermission(
      scenario.userId,
      scenario.userRole,
      scenario.action,
      scenario,
    );
  }
}
