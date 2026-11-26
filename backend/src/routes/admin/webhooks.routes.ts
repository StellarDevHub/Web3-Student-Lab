import { Router } from 'express';
import { webhookController } from '../../controllers/webhookController.js';
import { requireAdmin } from '../../middleware/admin.js';
import { authenticateToken } from '../../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

// Admin webhook inspection, failure analysis, and manual replay controls (Issues BE-015, BE-075).
router.use(authenticateToken as any);
router.use(requireAdmin as any);

router.get('/analytics', webhookController.getFailureAnalysis);
router.get('/failure-analysis', webhookController.getFailureAnalysis);
router.get('/deliveries', webhookController.listDeliveries);
router.post('/deliveries/retrigger-failed', webhookController.retriggerFailed);
router.post('/deliveries/replay-failed', webhookController.retriggerFailed);
router.get('/deliveries/:deliveryId', webhookController.getDelivery);
router.post('/deliveries/:deliveryId/retrigger', webhookController.retriggerDelivery);
router.post('/deliveries/:deliveryId/replay', webhookController.retriggerDelivery);
router.get('/endpoints', webhookController.listEndpoints);
router.post('/endpoints/resume', webhookController.resumeEndpoint);

export default router;
