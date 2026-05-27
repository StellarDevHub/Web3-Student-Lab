import { Router } from 'express';
import dashboardRoutes from '../dashboard/dashboard.routes.js';
import feedbackRouter from '../feedback/feedback.routes.js';
import userRouter from '../user/routes.js';
import analyticsRouter from './analytics.routes.js';
import authRoutes from './auth/auth.routes.js';
import certificatesRouter from './certificates.routes.js';
import coursesRouter from './courses.js';
import enrollmentsRouter from './enrollments.js';
import exportRouter from './export.routes.js';
import generatorRouter from './generator/generator.routes.js';
import learningRoutes from './learning/learning.routes.js';
import healthRouter from './health.routes.js';
import securityRouter from './security.routes.js';
import studentsRouter from './students.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/analytics', analyticsRouter);
router.use('/students', studentsRouter);
router.use('/certificates', certificatesRouter);
router.use('/courses', coursesRouter);
router.use('/enrollments', enrollmentsRouter);
router.use('/dashboard', dashboardRoutes);
router.use('/feedback', feedbackRouter);
router.use('/auth', authRoutes);
router.use('/learning', learningRoutes);
router.use('/security', securityRouter);
router.use('/generator', generatorRouter);
router.use('/export', exportRouter);
router.use('/user', userRouter);

export default router;
