import apiClient from './api-client';

export interface AuditLogEntry {
  action: string;
  entity?: string;
  entityId?: string;
  details?: any;
}

/**
 * Utility to send audit logs from the frontend to the backend
 */
export const auditLogger = {
  /**
   * Logs an action to the backend audit infrastructure
   */
  log: async (entry: AuditLogEntry): Promise<void> => {
    try {
      // In a real application, we might want to batch these or send them in the background
      await apiClient.post('/audit/log', entry);
      console.log(`[Audit] Action logged: ${entry.action}`);
    } catch (error) {
      // We don't want to break the UI if logging fails
      console.warn('Failed to send audit log:', error);
    }
  },

  /**
   * Helper for logging course actions
   */
  logCourseAction: (
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE',
    courseId?: string,
    details?: any
  ) => {
    return auditLogger.log({
      action: `${action}_COURSE`,
      entity: 'Course',
      entityId: courseId,
      details,
    });
  },

  /**
   * Helper for logging certificate actions
   */
  logCertificateAction: (
    action: 'VIEW' | 'ISSUE' | 'REVOKE' | 'VERIFY',
    certId?: string,
    details?: any
  ) => {
    return auditLogger.log({
      action: `${action}_CERTIFICATE`,
      entity: 'Certificate',
      entityId: certId,
      details,
    });
  },
};
