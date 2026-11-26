import { Router } from 'express';
import { mediaController } from '../controllers/mediaController.js';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

// Public lookups
router.get('/certificates/:certificateId', mediaController.getCertificateAssets);
router.get('/:cid', mediaController.getByCid);

// Protected operations
router.post('/pin', authenticateToken, requireAdmin, mediaController.pinAsset);
router.post('/:cid/verify', authenticateToken, mediaController.verifyCid);

// Video Transcoding & HLS Streaming with Signed CloudFront Cookies (#1844 / BE-097)
router.post('/transcode', authenticateToken, mediaController.enqueueTranscode);
router.post('/courses/:courseId/videos/:videoId/session', authenticateToken, mediaController.createStreamSession);
router.get('/courses/:courseId/videos/:videoId/session', authenticateToken, mediaController.createStreamSession);
router.get('/courses/:courseId/videos/:videoId/hls/:file', optionalAuthenticateToken, mediaController.getHlsSegmentOrManifest);

export default router;
