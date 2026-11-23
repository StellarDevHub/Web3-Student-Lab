import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { channelController } from '../controllers/channelController.js';
import { stateChannelService } from '../services/stateChannelService.js';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.post('/', channelController.openChannel);
router.get('/:channelId', channelController.getChannel);
router.get('/:channelId/updates', channelController.getHistory);
router.post('/:channelId/updates', channelController.submitUpdate);
router.post('/:channelId/dispute', channelController.initiateDispute);

// Settle disputes whose challenge window expired without a response.
if (process.env.NODE_ENV !== 'test') {
  stateChannelService.startDisputeWatcher();
}

export default router;
