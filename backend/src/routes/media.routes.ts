import { Router } from 'express';
import { mediaController } from '../controllers/mediaController.js';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

// Public lookups
router.get('/certificates/:certificateId', mediaController.getCertificateAssets);
router.get('/:cid', mediaController.getByCid);

// Protected operations
router.post('/pin', authenticateToken, requireAdmin, mediaController.pinAsset);
router.post('/:cid/verify', authenticateToken, mediaController.verifyCid);

export default router;
