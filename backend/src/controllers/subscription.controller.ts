import { NextFunction, Request, Response } from 'express';
import { subscriptionService } from '../services/subscription.service.js';
import logger from '../utils/logger.js';
import { ApiResponse, asyncHandler } from '../utils/response.js';
import { WebSocketServer } from '../websocket/WebSocketServer.js';

export const subscriptionController = {
  // Get all subscription plans
  getPlans: asyncHandler(async (req: Request, res: Response) => {
    const plans = await subscriptionService.getAllPlans();

    return res.status(200).json(
      ApiResponse.success('Plans retrieved successfully', plans)
    );
  }),

  // Get specific plan by tier
  getPlan: asyncHandler(async (req: Request, res: Response) => {
    const { tier } = req.params;

    const plan = await subscriptionService.getPlanByTier(tier);

    return res.status(200).json(
      ApiResponse.success('Plan retrieved successfully', plan)
    );
  }),

  // Get user's subscriptions
  getUserSubscriptions: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const subscriptions = await subscriptionService.getUserSubscriptions(userId);

    return res.status(200).json(
      ApiResponse.success('User subscriptions retrieved successfully', subscriptions)
    );
  }),

  // Create new subscription
  createSubscription: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { tier, billingPeriod, paymentMethod, autoRenew } = req.body;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const subscription = await subscriptionService.createSubscription({
      userId,
      tier,
      billingPeriod,
      paymentMethod,
      autoRenew: autoRenew || false
    });

    // Invalidate cache for user subscriptions
    await redisConnection.del(`user_subscriptions:${userId}`);

    // Notify via WebSocket
    WebSocketServer.getInstance().broadcastToUser(userId, {
      type: 'subscription_created',
      data: subscription
    });

    logger.info(`Subscription created for user ${userId}: ${subscription.id}`);

    return res.status(201).json(
      ApiResponse.success('Subscription created successfully', subscription)
    );
  }),

  // Cancel subscription
  cancelSubscription: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { subscriptionId } = req.params;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const result = await subscriptionService.cancelSubscription(
      parseInt(subscriptionId),
      userId
    );

    // Invalidate cache
    await redisConnection.del(`user_subscriptions:${userId}`);
    await redisConnection.del(`subscription:${subscriptionId}`);

    // Notify via WebSocket
    WebSocketServer.getInstance().broadcastToUser(userId, {
      type: 'subscription_cancelled',
      data: { subscriptionId: parseInt(subscriptionId), refundAmount: result.refundAmount }
    });

    logger.info(`Subscription ${subscriptionId} cancelled by user ${userId}`);

    return res.status(200).json(
      ApiResponse.success('Subscription cancelled successfully', result)
    );
  }),

  // Renew subscription
  renewSubscription: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { subscriptionId } = req.params;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const subscription = await subscriptionService.renewSubscription(
      parseInt(subscriptionId),
      userId
    );

    // Invalidate cache
    await redisConnection.del(`user_subscriptions:${userId}`);
    await redisConnection.del(`subscription:${subscriptionId}`);

    // Notify via WebSocket
    WebSocketServer.getInstance().broadcastToUser(userId, {
      type: 'subscription_renewed',
      data: subscription
    });

    logger.info(`Subscription ${subscriptionId} renewed by user ${userId}`);

    return res.status(200).json(
      ApiResponse.success('Subscription renewed successfully', subscription)
    );
  }),

  // Get specific subscription
  getSubscription: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { subscriptionId } = req.params;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const subscription = await subscriptionService.getSubscription(
      parseInt(subscriptionId),
      userId
    );

    return res.status(200).json(
      ApiResponse.success('Subscription retrieved successfully', subscription)
    );
  }),

  // Get subscription payment history
  getSubscriptionPayments: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { subscriptionId } = req.params;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error('User not authenticated')
      );
    }

    const payments = await subscriptionService.getSubscriptionPayments(
      parseInt(subscriptionId),
      userId
    );

    return res.status(200).json(
      ApiResponse.success('Payment history retrieved successfully', payments)
    );
  }),

  // Admin: Get all subscriptions
  getAllSubscriptions: asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, status, tier } = req.query;

    const subscriptions = await subscriptionService.getAllSubscriptions({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      tier: tier as string
    });

    return res.status(200).json(
      ApiResponse.success('All subscriptions retrieved successfully', subscriptions)
    );
  }),

  // Admin: Get subscription analytics
  getSubscriptionAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const { period = '30d' } = req.query;

    const analytics = await subscriptionService.getSubscriptionAnalytics(period as string);

    return res.status(200).json(
      ApiResponse.success('Subscription analytics retrieved successfully', analytics)
    );
  }),

  // Admin: Update subscription plan
  updatePlan: asyncHandler(async (req: Request, res: Response) => {
    const adminId = req.user?.id;
    const { tier, name, description, price, currency, features, maxUsers, isActive } = req.body;

    if (!adminId) {
      return res.status(401).json(
        ApiResponse.error('Admin not authenticated')
      );
    }

    const plan = await subscriptionService.updatePlan({
      tier,
      name,
      description,
      price,
      currency,
      features,
      maxUsers,
      isActive
    });

    // Invalidate plans cache
    await redisConnection.del('subscription_plans');

    // Broadcast plan update
    WebSocketServer.getInstance().broadcast({
      type: 'plan_updated',
      data: plan
    });

    logger.info(`Plan ${tier} updated by admin ${adminId}`);

    return res.status(200).json(
      ApiResponse.success('Plan updated successfully', plan)
    );
  }),

  // Admin: Pause contract
  pauseContract: asyncHandler(async (req: Request, res: Response) => {
    const adminId = req.user?.id;
    const { reason } = req.body;

    if (!adminId) {
      return res.status(401).json(
        ApiResponse.error('Admin not authenticated')
      );
    }

    await subscriptionService.pauseContract(reason);

    // Broadcast contract pause
    WebSocketServer.getInstance().broadcast({
      type: 'contract_paused',
      data: { reason, pausedBy: adminId }
    });

    logger.warn(`Contract paused by admin ${adminId}: ${reason}`);

    return res.status(200).json(
      ApiResponse.success('Contract paused successfully')
    );
  }),

  // Admin: Unpause contract
  unpauseContract: asyncHandler(async (req: Request, res: Response) => {
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json(
        ApiResponse.error('Admin not authenticated')
      );
    }

    await subscriptionService.unpauseContract();

    // Broadcast contract unpause
    WebSocketServer.getInstance().broadcast({
      type: 'contract_unpaused',
      data: { unpausedBy: adminId }
    });

    logger.info(`Contract unpaused by admin ${adminId}`);

    return res.status(200).json(
      ApiResponse.success('Contract unpaused successfully')
    );
  }),

  // Admin: Emergency pause contract
  emergencyPauseContract: asyncHandler(async (req: Request, res: Response) => {
    const adminId = req.user?.id;
    const { reason } = req.body;

    if (!adminId) {
      return res.status(401).json(
        ApiResponse.error('Admin not authenticated')
      );
    }

    await subscriptionService.emergencyPauseContract(reason);

    // Broadcast emergency pause
    WebSocketServer.getInstance().broadcast({
      type: 'emergency_pause',
      data: { reason, pausedBy: adminId }
    });

    logger.error(`Emergency pause activated by admin ${adminId}: ${reason}`);

    return res.status(200).json(
      ApiResponse.success('Emergency pause activated successfully')
    );
  }),

  // Middleware to require admin role
  requireAdmin: asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || user.role !== 'admin') {
      return res.status(403).json(
        ApiResponse.error('Admin access required')
      );
    }

    next();
  })
};
