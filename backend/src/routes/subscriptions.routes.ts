import { Router } from 'express';
import { subscriptionController } from '../controllers/subscription.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimit } from 'express-rate-limit';
import { validateSubscriptionCreate, validateSubscriptionUpdate } from '../middleware/validation.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = Router();

// Rate limiting for subscription operations
const subscriptionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many subscription requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.get('/plans', cacheMiddleware(300), subscriptionController.getPlans);
router.get('/plans/:tier', cacheMiddleware(300), subscriptionController.getPlan);

// Protected routes (require authentication)
router.use(authenticateToken);

// User subscription routes
router.get('/user', cacheMiddleware(60), subscriptionController.getUserSubscriptions);
router.post('/create', subscriptionRateLimit, validateSubscriptionCreate, subscriptionController.createSubscription);
router.post('/:subscriptionId/cancel', subscriptionRateLimit, subscriptionController.cancelSubscription);
router.post('/:subscriptionId/renew', subscriptionRateLimit, subscriptionController.renewSubscription);
router.get('/:subscriptionId', cacheMiddleware(60), subscriptionController.getSubscription);
router.get('/:subscriptionId/payments', cacheMiddleware(60), subscriptionController.getSubscriptionPayments);

// Admin routes (require admin role)
router.use('/admin', subscriptionController.requireAdmin);

router.get('/admin/subscriptions', cacheMiddleware(30), subscriptionController.getAllSubscriptions);
router.get('/admin/analytics', cacheMiddleware(300), subscriptionController.getSubscriptionAnalytics);
router.post('/admin/plans', validateSubscriptionUpdate, subscriptionController.updatePlan);
router.post('/admin/pause', subscriptionController.pauseContract);
router.post('/admin/unpause', subscriptionController.unpauseContract);
router.post('/admin/emergency-pause', subscriptionController.emergencyPauseContract);

export default router;
