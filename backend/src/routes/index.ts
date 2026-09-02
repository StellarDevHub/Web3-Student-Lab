import { Router } from 'express';
import { optionalWorkspaceMiddleware } from '../middleware/WorkspaceContext.js';
import { validateWorkspaceMembership } from '../middleware/workspaceMembership.js';
import dashboardRoutes from '../dashboard/dashboard.routes.js';
import activityLogRouter from '../dashboard/activityLog.routes.js';
import feedbackRouter from '../feedback/feedback.routes.js';
import licenseRoutes from '../licenses/license.routes.js';
import userRouter from '../user/routes.js';
import analyticsRouter from './analytics.routes.js';
import authRoutes from './auth/auth.routes.js';
import certificatesRouter from './certificates.routes.js';
import contractRouter from './contracts.routes.js';
import coursesRouter from './courses.js';
import enrollmentsRouter from './enrollments.js';
import exportRouter from './export.routes.js';
import generatorRouter from './generator/generator.routes.js';
import explorerRouter from './generator/explorer.routes.js';
import healthRouter from './health.routes.js';
import i18nRouter from './i18n.routes.js';
import osctRouter from './osct/osct.routes.js';
import playgroundRouter from './playground/playground.routes.js';
import simulatorRouter from './simulator/simulator.routes.js';
import learningRoutes from './learning/learning.routes.js';
import curriculumSearchRouter from './search/curriculum-search.routes.js';
import securityRouter from './security.routes.js';
import seoRouter from './seo.routes.js';
import studentsRouter from './students.js';
import simulatorErrorsRouter from './simulatorErrors.routes.js';
import termsOfServiceRouter from './termsOfService.routes.js';
import privacyPolicyRouter from './privacyPolicy.routes.js';
import playgroundValidateRouter from './playground.routes.js';
import oauthRouter from './oauth.routes.js';
import tokenomicsRouter from './tokenomics.routes.js';

import notificationRouter from '../notifications/notification.routes.js';
import notificationPreferencesRouter from '../notifications/preferences.routes.js';
import metricsRouter from './metrics.routes.js';
import dependenciesRouter from './dependencies.routes.js';
import infrastructureRouter from '../infrastructure/infrastructure.routes.js';
import simulatorIdeasRouter from '../simulator/simulator.routes.js';

import deployRouter from './deploy.routes.js';
import didRouter from './did.routes.js';
import webhooksRouter from './webhooks.js';
import adminDLQRouter from './admin/dlq.routes.js';
import adminCoursesRouter from './admin/courses.routes.js';
import apiRouter from './api.js';
import policyRouter from './policy/policy.routes.js';
import storageRouter from './storage.routes.js';

const router: ReturnType<typeof Router> = Router();

// Populate the AsyncLocalStorage workspace context from the `x-workspace-id`
// header (or `workspaceId` query param) so the Prisma workspace-isolation
// extension filters every query automatically (#1119). Optional: requests
// without a workspace header pass through unscoped.
router.use(optionalWorkspaceMiddleware);

router.use('/health', healthRouter);
router.use('/analytics', analyticsRouter);
router.use('/students', studentsRouter);

// Cross-tenant data lives in courses, submissions (enrollments), certificates
// and learning progress — enforce workspace membership on those groups
// (#1119). Runs after the workspace context is populated above; requests
// without an authenticated user or workspace header pass through, while
// the Prisma extension still applies per-query tenant filtering.
router.use('/certificates', validateWorkspaceMembership, certificatesRouter);
router.use('/courses', validateWorkspaceMembership, coursesRouter);
router.use('/enrollments', validateWorkspaceMembership, enrollmentsRouter);
router.use('/feedback', validateWorkspaceMembership, feedbackRouter);
router.use('/learning', validateWorkspaceMembership, learningRoutes);

router.use('/dashboard', dashboardRoutes);
router.use('/dashboard/activity-log', activityLogRouter);
router.use('/auth', authRoutes);
router.use('/search', curriculumSearchRouter);
router.use('/contracts', contractRouter);
router.use('/notifications', notificationRouter);
router.use('/notifications/preferences', notificationPreferencesRouter);
router.use('/security', securityRouter);
router.use('/licenses', licenseRoutes);
router.use('/seo', seoRouter);
router.use('/i18n', i18nRouter);
router.use('/generator', generatorRouter);
router.use('/generator', explorerRouter);
router.use('/osct', osctRouter);
router.use('/simulator', simulatorRouter);
router.use('/playground', playgroundRouter);
router.use('/export', exportRouter);
router.use('/deploy', deployRouter);
router.use('/did', didRouter);
router.use('/webhooks', webhooksRouter);
router.use('/admin/dlq', adminDLQRouter);
router.use('/admin/courses', adminCoursesRouter);
router.use('/policy', policyRouter);
router.use('/storage', storageRouter);
router.use('/user', userRouter);
router.use('/metrics', metricsRouter);
router.use('/dependencies', dependenciesRouter);
router.use('/infrastructure', infrastructureRouter);
router.use('/simulator', simulatorIdeasRouter);
router.use('/simulator/errors', simulatorErrorsRouter);
router.use('/roadmap/tos', termsOfServiceRouter);
router.use('/playground', playgroundValidateRouter);
router.use('/playground/privacy-policy', privacyPolicyRouter);
router.use('/oauth', oauthRouter);
router.use('/', apiRouter);
router.use('/tokenomics', tokenomicsRouter);
router.use('/contributor-proofs', await import('./contributor-proofs.routes.js').then(m => m.default));

export default router;
