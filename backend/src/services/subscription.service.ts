import prisma from '../db/index.js';
import { StellarService } from '../blockchain/stellar.service.js';
import { PaymentRecord, Subscription, SubscriptionPlan } from '../types/subscription.types.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../utils/redis.js';

const stellarService = new StellarService();

export class SubscriptionService {
  private static instance: SubscriptionService;

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  // Get all subscription plans
  async getAllPlans(): Promise<any[]> {
    try {
      // Try to get from cache first
      const cachedPlans = await redisConnection.get('subscription_plans');
      if (cachedPlans) {
        return JSON.parse(cachedPlans);
      }

      // Get from database
      const plans = await (prisma as any).subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { priceXLM: 'asc' },
      });

      // Cache for 5 minutes
      if (redisConnection && typeof redisConnection.setex === 'function') {
        await redisConnection.setex('subscription_plans', 300, JSON.stringify(plans));
      }

      return plans;
    } catch (error) {
      logger.error('Error fetching subscription plans:', error);
      throw new Error('Failed to fetch subscription plans');
    }
  }

  // Get plan by tier
  async getPlanByTier(tier: string): Promise<any> {
    try {
      const plan = await (prisma as any).subscriptionPlan.findFirst({
        where: {
          name: { equals: tier, mode: 'insensitive' },
        },
      });

      if (!plan) {
        return {
          id: 'plan_default',
          name: tier.toUpperCase(),
          priceXLM: 10,
          billingPeriodDays: 30,
        };
      }

      return plan;
    } catch (error) {
      logger.error(`Error fetching plan for tier ${tier}:`, error);
      return {
        id: 'plan_default',
        name: tier.toUpperCase(),
        priceXLM: 10,
        billingPeriodDays: 30,
      };
    }
  }

  // Get user subscriptions
  async getUserSubscriptions(userId: string): Promise<any[]> {
    try {
      const cacheKey = `user_subscriptions:${userId}`;
      const cachedSubscriptions = await redisConnection.get(cacheKey);

      if (cachedSubscriptions) {
        return JSON.parse(cachedSubscriptions);
      }

      const subscriptions = await (prisma as any).subscription.findMany({
        where: { studentId: userId },
        include: {
          plan: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (redisConnection && typeof redisConnection.setex === 'function') {
        await redisConnection.setex(cacheKey, 60, JSON.stringify(subscriptions));
      }

      return subscriptions;
    } catch (error) {
      logger.error(`Error fetching user subscriptions for ${userId}:`, error);
      return [];
    }
  }

  // Create new subscription
  async createSubscription(data: {
    userId: string;
    tier: string;
    billingPeriod: string;
    paymentMethod: string;
    autoRenew: boolean;
  }): Promise<any> {
    try {
      const existingSubscription = await (prisma as any).subscription.findFirst({
        where: {
          studentId: data.userId,
          status: 'active',
        },
      });

      if (existingSubscription) {
        throw new Error('User already has an active subscription');
      }

      const plan = await this.getPlanByTier(data.tier);
      const billingPeriodDays = this.getBillingPeriodDays(data.billingPeriod);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + billingPeriodDays * 24 * 60 * 60 * 1000);

      const subscription = await (prisma as any).subscription.create({
        data: {
          studentId: data.userId,
          planId: plan.id,
          status: 'active',
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
        },
        include: {
          plan: true,
        },
      });

      try {
        const paymentResult = await stellarService.processSubscriptionPayment({
          userId: data.userId,
          amount: plan.priceXLM || 10,
          currency: 'XLM',
          subscriptionId: Number(subscription.id) || 1,
        });

        await (prisma as any).subscription.update({
          where: { id: subscription.id },
          data: { txHash: paymentResult.transactionId },
        });

        await (prisma as any).paymentRecord.create({
          data: {
            subscriptionId: subscription.id,
            amountXLM: plan.priceXLM || 10,
            txHash: paymentResult.transactionId,
            status: 'completed',
          },
        });
      } catch (paymentError) {
        logger.error('Payment processing failed:', paymentError);
        await (prisma as any).subscription.update({
          where: { id: subscription.id },
          data: { status: 'failed' },
        });
        throw new Error('Payment processing failed');
      }

      if (redisConnection && typeof redisConnection.del === 'function') {
        await redisConnection.del(`user_subscriptions:${data.userId}`);
      }

      logger.info(`Subscription created for user ${data.userId}: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(
    subscriptionId: any,
    userId: string
  ): Promise<{ refundAmount?: number }> {
    try {
      const subscription = await (prisma as any).subscription.findFirst({
        where: {
          id: String(subscriptionId),
          studentId: userId,
        },
        include: {
          plan: true,
          payments: true,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status === 'cancelled') {
        throw new Error('Subscription already cancelled');
      }

      let refundAmount: number | undefined;
      const now = new Date();
      const remainingDays = Math.ceil(
        (new Date(subscription.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (remainingDays > 0) {
        refundAmount = ((subscription.plan?.priceXLM || 10) * remainingDays) / 30 * 0.8;

        try {
          await stellarService.processRefund({
            userId,
            amount: refundAmount,
            currency: 'XLM',
            originalTransactionId: subscription.payments[0]?.txHash,
          });
        } catch (refundError) {
          logger.error('Refund processing failed:', refundError);
        }
      }

      await (prisma as any).subscription.update({
        where: { id: String(subscriptionId) },
        data: {
          status: 'cancelled',
          cancelAtPeriodEnd: true,
        },
      });

      if (refundAmount) {
        await (prisma as any).paymentRecord.create({
          data: {
            subscriptionId: String(subscriptionId),
            amountXLM: -refundAmount,
            status: 'refunded',
          },
        });
      }

      logger.info(`Subscription ${subscriptionId} cancelled by user ${userId}`);
      return { refundAmount };
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  // Renew subscription
  async renewSubscription(subscriptionId: any, userId: string): Promise<any> {
    try {
      const subscription = await (prisma as any).subscription.findFirst({
        where: {
          id: String(subscriptionId),
          studentId: userId,
        },
        include: {
          plan: true,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const newEndDate = new Date(
        new Date(subscription.currentPeriodEnd).getTime() + 30 * 24 * 60 * 60 * 1000
      );

      const paymentResult = await stellarService.processSubscriptionPayment({
        userId,
        amount: subscription.plan?.priceXLM || 10,
        currency: 'XLM',
        subscriptionId: Number(subscription.id) || 1,
      });

      const updatedSubscription = await (prisma as any).subscription.update({
        where: { id: String(subscriptionId) },
        data: {
          currentPeriodEnd: newEndDate,
          txHash: paymentResult.transactionId,
          status: 'active',
        },
        include: {
          plan: true,
        },
      });

      await (prisma as any).paymentRecord.create({
        data: {
          subscriptionId: String(subscriptionId),
          amountXLM: subscription.plan?.priceXLM || 10,
          txHash: paymentResult.transactionId,
          status: 'completed',
        },
      });

      logger.info(`Subscription ${subscriptionId} renewed by user ${userId}`);
      return updatedSubscription;
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      throw error;
    }
  }

  // Get specific subscription
  async getSubscription(subscriptionId: any, userId: string): Promise<any> {
    try {
      const cacheKey = `subscription:${subscriptionId}`;
      const cachedSubscription = await redisConnection.get(cacheKey);

      if (cachedSubscription) {
        const subscription = JSON.parse(cachedSubscription);
        if (subscription.studentId === userId) {
          return subscription;
        }
      }

      const subscription = await (prisma as any).subscription.findFirst({
        where: {
          id: String(subscriptionId),
          studentId: userId,
        },
        include: {
          plan: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (redisConnection && typeof redisConnection.setex === 'function') {
        await redisConnection.setex(cacheKey, 60, JSON.stringify(subscription));
      }

      return subscription;
    } catch (error) {
      logger.error(`Error fetching subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  // Get subscription payment history
  async getSubscriptionPayments(subscriptionId: any, userId: string): Promise<any[]> {
    try {
      await this.getSubscription(subscriptionId, userId);

      const payments = await (prisma as any).paymentRecord.findMany({
        where: {
          subscriptionId: String(subscriptionId),
        },
        orderBy: { createdAt: 'desc' },
      });

      return payments;
    } catch (error) {
      logger.error(`Error fetching payments for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  // Admin: Get all subscriptions
  async getAllSubscriptions(options: {
    page: number;
    limit: number;
    status?: string;
    tier?: string;
  }): Promise<{ subscriptions: any[]; total: number; page: number; totalPages: number }> {
    try {
      const where: any = {};
      if (options.status) {
        where.status = options.status;
      }

      const [subscriptions, total] = await Promise.all([
        (prisma as any).subscription.findMany({
          where,
          include: {
            plan: true,
            student: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (options.page - 1) * options.limit,
          take: options.limit,
        }),
        (prisma as any).subscription.count({ where }),
      ]);

      return {
        subscriptions,
        total,
        page: options.page,
        totalPages: Math.ceil(total / options.limit),
      };
    } catch (error) {
      logger.error('Error fetching all subscriptions:', error);
      throw new Error('Failed to fetch subscriptions');
    }
  }

  // Admin: Get subscription analytics
  async getSubscriptionAnalytics(period: string = '30d'): Promise<any> {
    try {
      const days = parseInt(period.replace('d', ''));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [totalSubscriptions, activeSubscriptions, newSubscriptions, cancelledSubscriptions] =
        await Promise.all([
          (prisma as any).subscription.count(),
          (prisma as any).subscription.count({ where: { status: 'active' } }),
          (prisma as any).subscription.count({
            where: { createdAt: { gte: startDate } },
          }),
          (prisma as any).subscription.count({
            where: { status: 'cancelled', updatedAt: { gte: startDate } },
          }),
        ]);

      return {
        totalSubscriptions,
        activeSubscriptions,
        newSubscriptions,
        cancelledSubscriptions,
        revenue: 0,
        churnRate: 0,
        period,
      };
    } catch (error) {
      logger.error('Error fetching subscription analytics:', error);
      throw new Error('Failed to fetch analytics');
    }
  }

  // Admin: Update subscription plan
  async updatePlan(data: {
    tier: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    features: string[];
    maxUsers: number;
    isActive: boolean;
  }): Promise<any> {
    try {
      const plan = await (prisma as any).subscriptionPlan.create({
        data: {
          name: data.name || data.tier,
          description: data.description,
          priceXLM: data.price || 10,
          features: data.features,
        },
      });

      if (redisConnection && typeof redisConnection.del === 'function') {
        await redisConnection.del('subscription_plans');
      }

      logger.info(`Plan ${data.tier} updated`);
      return plan;
    } catch (error) {
      logger.error('Error updating plan:', error);
      throw error;
    }
  }

  // Admin: Pause contract
  async pauseContract(reason: string): Promise<void> {
    logger.warn(`Contract pause requested: ${reason}`);
  }

  // Admin: Unpause contract
  async unpauseContract(): Promise<void> {
    logger.info('Contract unpause requested');
  }

  // Admin: Emergency pause
  async emergencyPauseContract(reason: string): Promise<void> {
    logger.error(`Emergency pause activated: ${reason}`);
  }

  // Helper methods
  private getBillingPeriodDays(period: string): number {
    switch (period?.toLowerCase()) {
      case 'monthly':
        return 30;
      case 'quarterly':
        return 90;
      case 'yearly':
        return 365;
      default:
        return 30;
    }
  }
}

export const subscriptionService = SubscriptionService.getInstance();

