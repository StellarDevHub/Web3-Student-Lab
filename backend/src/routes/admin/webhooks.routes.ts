import { Router } from 'express';
import { webhookController } from '../../controllers/webhookController.js';
import { requireAdmin } from '../../middleware/admin.js';
import { authenticateToken } from '../../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

// Re-triggering deliveries and resuming endpoints are admin-only (Issue BE-015).
router.use(authenticateToken as any);
router.use(requireAdmin as any);

router.get('/deliveries', webhookController.listDeliveries);
router.post('/deliveries/retrigger-failed', webhookController.retriggerFailed);
router.get('/deliveries/:deliveryId', webhookController.getDelivery);
router.post('/deliveries/:deliveryId/retrigger', webhookController.retriggerDelivery);
router.get('/endpoints', webhookController.listEndpoints);
router.post('/endpoints/resume', webhookController.resumeEndpoint);

export default router;
