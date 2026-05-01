import { Router } from 'express';
import blockchainRouter from '../blockchain/balance.js';
import dashboardRouter from '../dashboard/dashboard.routes.js';
import feedbackRouter from '../feedback/feedback.routes.js';
import userRouter from '../user/routes.js';
import auditRouter from './audit.js';
import authRoutes from './auth/auth.routes.js';
import canvasRouter from './canvas.routes.js';
import certificatesRouter from './certificates.routes.js';
import coursesRouter from './courses.js';
import enrollmentsRouter from './enrollments.js';
import exportRouter from './export.routes.js';
import generatorRoutes from './generator/generator.routes.js';
import learningRoutes from './learning/learning.routes.js';
import searchRoutes from './search/search.routes.js';
import studentsRouter from './students.js';
import webhookRouter from './webhooks.js';

import activityRouter from './activity.routes.js';
import analyticsRouter from './analytics.routes.js';
import securityRouter from './security.routes.js';
import subscriptionsRouter from './subscriptions.js';
import lendingRouter from './lending.routes.js';

import healthRouter from './health.routes.js';

const router = Router();

// Mount all feature routers
router.use('/health', healthRouter);
router.use('/security', securityRouter);

router.use('/analytics', analyticsRouter);
router.use('/students', studentsRouter);
router.use('/courses', coursesRouter);
router.use('/certificates', certificatesRouter);
router.use('/canvas', canvasRouter);
router.use('/enrollments', enrollmentsRouter);
router.use('/feedback', feedbackRouter);
router.use('/dashboard', dashboardRouter);
router.use('/auth', authRoutes);
router.use('/learning', learningRoutes);
router.use('/generator', generatorRoutes);
router.use('/search', searchRoutes);
router.use('/user', userRouter);
router.use('/activity', activityRouter);
router.use('/audit', auditRouter);
router.use('/export', exportRouter);
router.use('/subscriptions', subscriptionsRouter);

// Blockchain routes
router.use('/blockchain', blockchainRouter);

router.use('/subscriptions', subscriptionsRouter);
router.use('/lending', lendingRouter);

router.use('/webhooks', webhookRouter);

export default router;
