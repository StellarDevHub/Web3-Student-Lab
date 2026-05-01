import { create } from 'zustand';
import { devtools, logger, securePersist } from './middleware';
import {
  SubscriptionPlan,
  Subscription,
  PaymentRecord,
  FailedPayment,
  SubscriptionAnalytics,
} from '@/components/subscriptions/types';

export interface SubscriptionState {
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  failedPayments: FailedPayment[];
  analytics: SubscriptionAnalytics | null;
  loading: boolean;
  error: string | null;
}

export interface SubscriptionActions {
  fetchPlans: () => Promise<void>;
  fetchSubscriptions: (userPublicKey: string) => Promise<void>;
  fetchPayments: (subscriptionId: string) => Promise<void>;
  fetchFailedPayments: () => Promise<void>;
  fetchAnalytics: (merchantKey: string) => Promise<void>;
  createPlan: (params: {
    merchant: string;
    name: string;
    description: string;
    amount: number;
    frequency: number;
    token: string;
  }) => Promise<void>;
  subscribe: (params: {
    subscriber: string;
    plan_id: string;
  }) => Promise<void>;
  cancelSubscription: (params: {
    subscriber: string;
    subscription_id: string;
  }) => Promise<number>;
  pauseSubscription: (params: {
    subscriber: string;
    subscription_id: string;
  }) => Promise<void>;
  resumeSubscription: (params: {
    subscriber: string;
    subscription_id: string;
  }) => Promise<void>;
  executePayment: (params: {
    subscription_id: string;
    subscription_contract: string;
  }) => Promise<string>;
  retryFailedPayment: (params: {
    subscription_id: string;
    subscription_contract: string;
  }) => Promise<string | null>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export type SubscriptionStore = SubscriptionState & SubscriptionActions;

const initialState: SubscriptionState = {
  plans: [],
  subscriptions: [],
  payments: [],
  failedPayments: [],
  analytics: null,
  loading: false,
  error: null,
};

export const useSubscriptionStore = create<SubscriptionStore>()(
  devtools(
    logger(
      securePersist(
        (set, get) => ({
          ...initialState,

          fetchPlans: async () => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/plans');
              if (!response.ok) throw new Error('Failed to fetch plans');
              const plans = await response.json();
              set({ plans, loading: false });
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
            }
          },

          fetchSubscriptions: async (userPublicKey: string) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch(
                `/api/subscriptions/user/${userPublicKey}`
              );
              if (!response.ok) throw new Error('Failed to fetch subscriptions');
              const subscriptions = await response.json();
              set({ subscriptions, loading: false });
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
            }
          },

          fetchPayments: async (subscriptionId: string) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch(
                `/api/subscriptions/payments/${subscriptionId}`
              );
              if (!response.ok) throw new Error('Failed to fetch payments');
              const payments = await response.json();
              set({ payments, loading: false });
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
            }
          },

          fetchFailedPayments: async () => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/failed-payments');
              if (!response.ok) throw new Error('Failed to fetch failed payments');
              const failedPayments = await response.json();
              set({ failedPayments, loading: false });
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
            }
          },

          fetchAnalytics: async (merchantKey: string) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch(
                `/api/subscriptions/analytics/${merchantKey}`
              );
              if (!response.ok) throw new Error('Failed to fetch analytics');
              const analytics = await response.json();
              set({ analytics, loading: false });
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
            }
          },

          createPlan: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to create plan');
              await get().fetchPlans();
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          subscribe: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to subscribe');
              await get().fetchSubscriptions(params.subscriber);
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          cancelSubscription: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to cancel subscription');
              const data = await response.json();
              await get().fetchSubscriptions(params.subscriber);
              return data.refund_amount || 0;
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          pauseSubscription: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to pause subscription');
              await get().fetchSubscriptions(params.subscriber);
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          resumeSubscription: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to resume subscription');
              await get().fetchSubscriptions(params.subscriber);
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          executePayment: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/execute-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to execute payment');
              const data = await response.json();
              set({ loading: false });
              return data.payment_id;
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          retryFailedPayment: async (params) => {
            set({ loading: true, error: null });
            try {
              const response = await fetch('/api/subscriptions/retry-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
              if (!response.ok) throw new Error('Failed to retry payment');
              const data = await response.json();
              set({ loading: false });
              return data.payment_id || null;
            } catch (error) {
              set({
                error: error instanceof Error ? error.message : 'Unknown error',
                loading: false,
              });
              throw error;
            }
          },

          setLoading: (loading) => set({ loading }),
          setError: (error) => set({ error }),
        }),
        { name: 'subscription-storage' }
      )
    )
  )
);
