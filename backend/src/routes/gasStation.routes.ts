import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { gasStationController } from '../controllers/gasStationController.js';
import { gasQuotaMiddleware } from '../middleware/gasQuotaMiddleware.js';

const router: ReturnType<typeof Router> = Router();

router.get('/contracts', gasStationController.getWhitelist);
router.get('/quota', authenticate, gasStationController.getQuota);
router.post('/sponsor', authenticate, gasQuotaMiddleware, gasStationController.sponsor);

export default router;
