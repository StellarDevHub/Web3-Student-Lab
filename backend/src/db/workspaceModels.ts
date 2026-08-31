/**
 * Models carrying a `workspaceId` column — the set the workspace-isolation
 * extension filters. Kept in sync with the Prisma schema; every model with a
 * `workspaceId` must appear here (#1119).
 */
export const workspaceModels = new Set([
  'Student',
  'Course',
  'Certificate',
  'CertificateVerificationEvent',
  'ContributorProof',
  'DecentralizedAsset',
  'Enrollment',
  'Feedback',
  'Idea',
  'LearningProgress',
  'AuditLog',
  'Canvas',
  'NotificationPreferences',
  'P2PNode',
  'WebhookSubscription',
  'TranslationEntry',
  'VestingSchedule',
]);
