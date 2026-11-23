import { Router } from 'express';
import activityLogRouter from '../dashboard/activityLog.routes.js';
import dashboardRoutes from '../dashboard/dashboard.routes.js';
import feedbackRouter from '../feedback/feedback.routes.js';
import licenseRoutes from '../licenses/license.routes.js';
import { optionalWorkspaceMiddleware } from '../middleware/WorkspaceContext.js';
import { validateWorkspaceMembership } from '../middleware/workspaceMembership.js';
import userRouter from '../user/routes.js';
import analyticsRouter from './analytics.routes.js';
import authRoutes from './auth/auth.routes.js';
import certificatesRouter from './certificates.routes.js';
import contractRouter from './contracts.routes.js';
import coursesRouter from './courses.js';
import enrollmentsRouter from './enrollments.js';
import evaluationsRouter from './evaluations.routes.js';
import exportRouter from './export.routes.js';
import explorerRouter from './generator/explorer.routes.js';
import generatorRouter from './generator/generator.routes.js';
import healthRouter from './health.routes.js';
import i18nRouter from './i18n.routes.js';
import learningRoutes from './learning/learning.routes.js';
import mediaRouter from './media.routes.js';
import oauthRouter from './oauth.routes.js';
import osctRouter from './osct/osct.routes.js';
import playgroundValidateRouter from './playground.routes.js';
import playgroundRouter from './playground/playground.routes.js';
import privacyPolicyRouter from './privacyPolicy.routes.js';
import curriculumSearchRouter from './search/curriculum-search.routes.js';
import securityRouter from './security.routes.js';
import seoRouter from './seo.routes.js';
import simulatorRouter from './simulator/simulator.routes.js';
import simulatorErrorsRouter from './simulatorErrors.routes.js';
import studentsRouter from './students.js';
import termsOfServiceRouter from './termsOfService.routes.js';
import tokenomicsRouter from './tokenomics.routes.js';

import infrastructureRouter from '../infrastructure/infrastructure.routes.js';
import notificationRouter from '../notifications/notification.routes.js';
import notificationPreferencesRouter from '../notifications/preferences.routes.js';
import simulatorIdeasRouter from '../simulator/simulator.routes.js';
import dependenciesRouter from './dependencies.routes.js';
import metricsRouter from './metrics.routes.js';

import adminCoursesRouter from './admin/courses.routes.js';
import adminDLQRouter from './admin/dlq.routes.js';
import adminQueuesRouter from './admin/queues.routes.js';
import adminWebhooksRouter from './admin/webhooks.routes.js';
import apiRouter from './api.js';
import contributorProofsRouter from './contributor-proofs.routes.js';
import deployRouter from './deploy.routes.js';
import didRouter from './did.routes.js';
import identityRouter from './identity.routes.js';
import policyRouter from './policy/policy.routes.js';
import relayerRouter from './relayer.routes.js';
import storageRouter from './storage.routes.js';
import streamsRouter from './streams.routes.js';
import sybilRouter from './sybil.routes.js';
import passkeyRouter from './passkey.routes.js';
import webhooksRouter from './webhooks.js';
import canvasRouter from './canvas.routes.js';
import channelsRouter from './channels.routes.js';
import gasStationRouter from './gasStation.routes.js';
import subscriptionsRouter from './subscriptions.routes.js';

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
router.use('/canvas', validateWorkspaceMembership, canvasRouter);

router.use('/media', mediaRouter);
router.use('/dashboard', dashboardRoutes);
router.use('/dashboard/activity-log', activityLogRouter);
router.use('/auth', authRoutes);
router.use('/search', curriculumSearchRouter);
router.use('/contracts', contractRouter);
router.use('/evaluations', evaluationsRouter);
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
router.use('/identity', identityRouter);
router.use('/streams', streamsRouter);
router.use('/sybil', sybilRouter);
router.use('/webhooks', webhooksRouter);
router.use('/admin/dlq', adminDLQRouter);
router.use('/admin/queues', adminQueuesRouter);
router.use('/admin/webhooks', adminWebhooksRouter);
router.use('/admin/courses', adminCoursesRouter);
router.use('/policy', policyRouter);
router.use('/storage', storageRouter);
router.use('/passkey', passkeyRouter);
router.use('/relayer', relayerRouter);
router.use('/channels', channelsRouter);
router.use('/gas-station', gasStationRouter);
router.use('/subscriptions', subscriptionsRouter);
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
router.use('/contributor-proofs', contributorProofsRouter);

export default router;
