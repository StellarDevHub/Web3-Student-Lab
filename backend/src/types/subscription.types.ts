// Subscription related types for the backend

export enum SubscriptionTier {
  BASIC = 'BASIC',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE'
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  FAILED = 'FAILED'
}

export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingPeriod: BillingPeriod;
  features: string[];
  maxUsers: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: number;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  lastBillingDate: Date;
  nextBillingDate: Date;
  autoRenew: boolean;
  paymentMethod: string;
  stellarTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
  plan?: SubscriptionPlan;
  payments?: PaymentRecord[];
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface PaymentRecord {
  id: number;
  subscriptionId: number;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId?: string;
  billingPeriod: BillingPeriod;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionData {
  userId: string;
  tier: string;
  billingPeriod: string;
  paymentMethod: string;
  autoRenew: boolean;
}

export interface UpdatePlanData {
  tier: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  features: string[];
  maxUsers: number;
  isActive: boolean;
}

export interface SubscriptionAnalytics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  newSubscriptions: number;
  cancelledSubscriptions: number;
  revenue: number;
  subscriptionsByTier: Array<{
    planId: string;
    _count: number;
  }>;
  churnRate: number;
  period: string;
}

export interface SubscriptionListResponse {
  subscriptions: Subscription[];
  total: number;
  page: number;
  totalPages: number;
}
