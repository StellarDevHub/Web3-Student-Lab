import { Subscription, SubscriptionPlan, PaymentRecord } from '../types/subscription.types.js';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from '../utils/redis.js';
import logger from '../utils/logger.js';
import { StellarService } from '../blockchain/stellar.service.js';

const prisma = new PrismaClient();
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
  async getAllPlans(): Promise<SubscriptionPlan[]> {
    try {
      // Try to get from cache first
      const cachedPlans = await redisConnection.get('subscription_plans');
      if (cachedPlans) {
        return JSON.parse(cachedPlans);
      }

      // Get from database
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' }
      });

      // Cache for 5 minutes
      await redisConnection.setex('subscription_plans', 300, JSON.stringify(plans));

      return plans;
    } catch (error) {
      logger.error('Error fetching subscription plans:', error);
      throw new Error('Failed to fetch subscription plans');
    }
  }

  // Get plan by tier
  async getPlanByTier(tier: string): Promise<SubscriptionPlan> {
    try {
      const plan = await prisma.subscriptionPlan.findFirst({
        where: { 
          tier: tier.toUpperCase(),
          isActive: true 
        }
      });

      if (!plan) {
        throw new Error(`Plan not found for tier: ${tier}`);
      }

      return plan;
    } catch (error) {
      logger.error(`Error fetching plan for tier ${tier}:`, error);
      throw error;
    }
  }

  // Get user subscriptions
  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    try {
      const cacheKey = `user_subscriptions:${userId}`;
      const cachedSubscriptions = await redisConnection.get(cacheKey);
      
      if (cachedSubscriptions) {
        return JSON.parse(cachedSubscriptions);
      }

      const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        include: {
          plan: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Cache for 1 minute
      await redisConnection.setex(cacheKey, 60, JSON.stringify(subscriptions));

      return subscriptions;
    } catch (error) {
      logger.error(`Error fetching user subscriptions for ${userId}:`, error);
      throw new Error('Failed to fetch user subscriptions');
    }
  }

  // Create new subscription
  async createSubscription(data: {
    userId: string;
    tier: string;
    billingPeriod: string;
    paymentMethod: string;
    autoRenew: boolean;
  }): Promise<Subscription> {
    try {
      // Check if user already has active subscription
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          userId: data.userId,
          status: 'ACTIVE'
        }
      });

      if (existingSubscription) {
        throw new Error('User already has an active subscription');
      }

      // Get plan details
      const plan = await this.getPlanByTier(data.tier);
      
      // Calculate subscription period
      const billingPeriodDays = this.getBillingPeriodDays(data.billingPeriod);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + billingPeriodDays * 24 * 60 * 60 * 1000);

      // Create subscription record
      const subscription = await prisma.subscription.create({
        data: {
          userId: data.userId,
          planId: plan.id,
          status: 'ACTIVE',
          startDate,
          endDate,
          lastBillingDate: startDate,
          nextBillingDate: endDate,
          autoRenew: data.autoRenew,
          paymentMethod: data.paymentMethod,
          stellarTransactionId: null // Will be set after payment
        },
        include: {
          plan: true
        }
      });

      // Process payment via Stellar
      try {
        const paymentResult = await stellarService.processSubscriptionPayment({
          userId: data.userId,
          amount: plan.price,
          currency: plan.currency,
          subscriptionId: subscription.id
        });

        // Update subscription with transaction ID
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { stellarTransactionId: paymentResult.transactionId }
        });

        // Create payment record
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            userId: data.userId,
            amount: plan.price,
            currency: plan.currency,
            status: 'COMPLETED',
            transactionId: paymentResult.transactionId,
            billingPeriod: data.billingPeriod
          }
        });

      } catch (paymentError) {
        logger.error('Payment processing failed:', paymentError);
        
        // Mark subscription as failed
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'FAILED' }
        });

        throw new Error('Payment processing failed');
      }

      // Invalidate cache
      await redisConnection.del(`user_subscriptions:${data.userId}`);

      logger.info(`Subscription created for user ${data.userId}: ${subscription.id}`);
      
      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: number, userId: string): Promise<{ refundAmount?: number }> {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId
        },
        include: {
          plan: true,
          payments: true
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status === 'CANCELLED') {
        throw new Error('Subscription already cancelled');
      }

      // Calculate refund if applicable
      let refundAmount: number | undefined;
      const now = new Date();
      const remainingDays = Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.ceil((subscription.endDate.getTime() - subscription.startDate.getTime()) / (1000 * 60 * 60 * 24));

      if (remainingDays > 0 && totalDays > 0) {
        const refundPercentage = remainingDays / totalDays;
        refundAmount = subscription.plan.price * refundPercentage * 0.8; // 80% refund rate

        // Process refund via Stellar
        try {
          await stellarService.processRefund({
            userId,
            amount: refundAmount,
            currency: subscription.plan.currency,
            originalTransactionId: subscription.payments[0]?.transactionId
          });
        } catch (refundError) {
          logger.error('Refund processing failed:', refundError);
          // Continue with cancellation even if refund fails
        }
      }

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'CANCELLED',
          endDate: now
        }
      });

      // Create payment record for refund if applicable
      if (refundAmount) {
        await prisma.payment.create({
          data: {
            subscriptionId,
            userId,
            amount: -refundAmount, // Negative amount for refund
            currency: subscription.plan.currency,
            status: 'REFUNDED',
            billingPeriod: subscription.payments[0]?.billingPeriod || 'MONTHLY'
          }
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
  async renewSubscription(subscriptionId: number, userId: string): Promise<Subscription> {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId
        },
        include: {
          plan: true
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'ACTIVE') {
        throw new Error('Subscription is not active');
      }

      // Calculate new end date
      const billingPeriodDays = this.getBillingPeriodDays(subscription.plan.billingPeriod);
      const newEndDate = new Date(subscription.endDate.getTime() + billingPeriodDays * 24 * 60 * 60 * 1000);

      // Process payment
      try {
        const paymentResult = await stellarService.processSubscriptionPayment({
          userId,
          amount: subscription.plan.price,
          currency: subscription.plan.currency,
          subscriptionId
        });

        // Update subscription
        const updatedSubscription = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            endDate: newEndDate,
            lastBillingDate: new Date(),
            nextBillingDate: newEndDate,
            stellarTransactionId: paymentResult.transactionId
          },
          include: {
            plan: true
          }
        });

        // Create payment record
        await prisma.payment.create({
          data: {
            subscriptionId,
            userId,
            amount: subscription.plan.price,
            currency: subscription.plan.currency,
            status: 'COMPLETED',
            transactionId: paymentResult.transactionId,
            billingPeriod: subscription.plan.billingPeriod
          }
        });

        logger.info(`Subscription ${subscriptionId} renewed by user ${userId}`);
        
        return updatedSubscription;
      } catch (paymentError) {
        logger.error('Renewal payment processing failed:', paymentError);
        throw new Error('Payment processing failed');
      }
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      throw error;
    }
  }

  // Get specific subscription
  async getSubscription(subscriptionId: number, userId: string): Promise<Subscription> {
    try {
      const cacheKey = `subscription:${subscriptionId}`;
      const cachedSubscription = await redisConnection.get(cacheKey);
      
      if (cachedSubscription) {
        const subscription = JSON.parse(cachedSubscription);
        // Verify user ownership
        if (subscription.userId === userId) {
          return subscription;
        }
      }

      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId
        },
        include: {
          plan: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Cache for 1 minute
      await redisConnection.setex(cacheKey, 60, JSON.stringify(subscription));

      return subscription;
    } catch (error) {
      logger.error(`Error fetching subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  // Get subscription payment history
  async getSubscriptionPayments(subscriptionId: number, userId: string): Promise<PaymentRecord[]> {
    try {
      // Verify subscription ownership
      await this.getSubscription(subscriptionId, userId);

      const payments = await prisma.payment.findMany({
        where: {
          subscriptionId,
          userId
        },
        orderBy: { createdAt: 'desc' }
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
  }): Promise<{ subscriptions: Subscription[]; total: number; page: number; totalPages: number }> {
    try {
      const where: any = {};
      
      if (options.status) {
        where.status = options.status;
      }
      
      if (options.tier) {
        where.plan = { tier: options.tier.toUpperCase() };
      }

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          include: {
            plan: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (options.page - 1) * options.limit,
          take: options.limit
        }),
        prisma.subscription.count({ where })
      ]);

      return {
        subscriptions,
        total,
        page: options.page,
        totalPages: Math.ceil(total / options.limit)
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

      const [
        totalSubscriptions,
        activeSubscriptions,
        newSubscriptions,
        cancelledSubscriptions,
        revenue,
        subscriptionsByTier,
        churnRate
      ] = await Promise.all([
        prisma.subscription.count(),
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.subscription.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),
        prisma.subscription.count({
          where: {
            status: 'CANCELLED',
            updatedAt: { gte: startDate }
          }
        }),
        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startDate }
          },
          _sum: { amount: true }
        }),
        prisma.subscription.groupBy({
          by: ['planId'],
          where: { status: 'ACTIVE' },
          _count: true
        }),
        this.calculateChurnRate(startDate)
      ]);

      return {
        totalSubscriptions,
        activeSubscriptions,
        newSubscriptions,
        cancelledSubscriptions,
        revenue: revenue._sum.amount || 0,
        subscriptionsByTier,
        churnRate,
        period
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
  }): Promise<SubscriptionPlan> {
    try {
      const plan = await prisma.subscriptionPlan.upsert({
        where: { tier: data.tier.toUpperCase() },
        update: {
          name: data.name,
          description: data.description,
          price: data.price,
          currency: data.currency,
          features: data.features,
          maxUsers: data.maxUsers,
          isActive: data.isActive
        },
        create: {
          tier: data.tier.toUpperCase(),
          name: data.name,
          description: data.description,
          price: data.price,
          currency: data.currency,
          features: data.features,
          maxUsers: data.maxUsers,
          isActive: data.isActive,
          billingPeriod: this.getDefaultBillingPeriod(data.tier)
        }
      });

      // Invalidate cache
      await redisConnection.del('subscription_plans');

      logger.info(`Plan ${data.tier} updated`);
      
      return plan;
    } catch (error) {
      logger.error('Error updating plan:', error);
      throw error;
    }
  }

  // Admin: Pause contract (via smart contract)
  async pauseContract(reason: string): Promise<void> {
    try {
      // This would interact with the Soroban smart contract
      // For now, we'll just log and update database status
      logger.warn(`Contract pause requested: ${reason}`);
      
      // Update system status in database
      await prisma.systemStatus.update({
        where: { key: 'contract_status' },
        data: { value: 'PAUSED' }
      });
    } catch (error) {
      logger.error('Error pausing contract:', error);
      throw error;
    }
  }

  // Admin: Unpause contract
  async unpauseContract(): Promise<void> {
    try {
      logger.info('Contract unpause requested');
      
      // Update system status in database
      await prisma.systemStatus.update({
        where: { key: 'contract_status' },
        data: { value: 'ACTIVE' }
      });
    } catch (error) {
      logger.error('Error unpausing contract:', error);
      throw error;
    }
  }

  // Admin: Emergency pause
  async emergencyPauseContract(reason: string): Promise<void> {
    try {
      logger.error(`Emergency pause activated: ${reason}`);
      
      // Update system status
      await prisma.systemStatus.update({
        where: { key: 'contract_status' },
        data: { value: 'EMERGENCY_PAUSE' }
      });
    } catch (error) {
      logger.error('Error activating emergency pause:', error);
      throw error;
    }
  }

  // Helper methods
  private getBillingPeriodDays(period: string): number {
    switch (period.toLowerCase()) {
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

  private getDefaultBillingPeriod(tier: string): string {
    switch (tier.toLowerCase()) {
      case 'basic':
        return 'MONTHLY';
      case 'pro':
        return 'QUARTERLY';
      case 'enterprise':
        return 'YEARLY';
      default:
        return 'MONTHLY';
    }
  }

  private async calculateChurnRate(startDate: Date): Promise<number> {
    try {
      const [startActive, endActive, cancelled] = await Promise.all([
        prisma.subscription.count({
          where: {
            status: 'ACTIVE',
            createdAt: { lt: startDate }
          }
        }),
        prisma.subscription.count({
          where: {
            status: 'ACTIVE'
          }
        }),
        prisma.subscription.count({
          where: {
            status: 'CANCELLED',
            updatedAt: { gte: startDate }
          }
        })
      ]);

      if (startActive === 0) return 0;
      
      return (cancelled / startActive) * 100;
    } catch (error) {
      logger.error('Error calculating churn rate:', error);
      return 0;
    }
  }
}

export const subscriptionService = SubscriptionService.getInstance();
