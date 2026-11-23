// backend/src/routes/api.ts
import activityRoutes from './activity.routes.js';
import auditRoutes from './audit.js';
import freelanceRoutes from './freelance.js';
import progressRoutes from './progress.js';

import { Router } from 'express';
import v2Lottery from './lottery.routes.js';

const apiRouter: Router = Router();
const v1Router: Router = Router();
const v2Router: Router = Router();

/**
 * Version 2 API Routes
 */
v2Router.use('/lottery', v2Lottery);

/**
 * Version 1 API Routes
 *
 * NOTE / EXPLICIT SPECIFICATION (Option 2 Fix):
 * The v1 lottery router intentionally shares the v2Lottery router implementation.
 * Both /api/v1/lottery and /api/v2/lottery maintain an identical contract and behavior.
 * This shared mounting is deliberate to maintain backwards-compatibility for v1 consumers
 * without maintaining redundant code until v1/v2 requirements diverge.
 */
v1Router.use('/lottery', v2Lottery);

// Mount previously orphaned route modules under unified /api/v1 gateway
v1Router.use('/activity', activityRoutes);
v1Router.use('/audit', auditRoutes);
v1Router.use('/freelance', freelanceRoutes);
v1Router.use('/progress', progressRoutes);

apiRouter.use('/v1', v1Router);
apiRouter.use('/v2', v2Router);

export default apiRouter;
export { v1Router, v2Router };
