export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  frequency: number;
  token: string;
  active: boolean;
  created_at: number;
  merchant: string;
}

export interface Subscription {
  id: string;
  plan_id: string;
  subscriber: string;
  merchant: string;
  amount: number;
  frequency: number;
  token: string;
  status: 'Active' | 'Paused' | 'Cancelled' | 'Expired';
  created_at: number;
  next_payment: number;
  last_payment: number;
  cancelled_at: number;
  pause_start: number;
  total_paid: number;
  plan?: SubscriptionPlan;
}

export interface PaymentRecord {
  id: string;
  subscription_id: string;
  subscriber: string;
  merchant: string;
  amount: number;
  token: string;
  timestamp: number;
  status: 'Success' | 'Failed' | 'Retried' | 'Refunded';
  retry_count: number;
  tx_hash: string;
}

export interface FailedPayment {
  subscription_id: string;
  retry_count: number;
  last_attempt: number;
  next_retry: number;
  reason: string;
}

export interface SubscriptionAnalytics {
  total_subscriptions: number;
  active_subscriptions: number;
  cancelled_subscriptions: number;
  total_revenue: number;
  monthly_revenue: number;
  average_subscription_length: number;
}

export type FrequencyType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const FREQUENCY_OPTIONS: { value: FrequencyType; label: string; seconds: number }[] = [
  { value: 'daily', label: 'Daily', seconds: 86400 },
  { value: 'weekly', label: 'Weekly', seconds: 604800 },
  { value: 'monthly', label: 'Monthly', seconds: 2592000 },
  { value: 'yearly', label: 'Yearly', seconds: 31536000 },
];
