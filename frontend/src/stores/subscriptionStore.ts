import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface SubscriptionPlan {
  id: string;
  tier: 'BASIC' | 'PRO' | 'ENTERPRISE';
  name: string;
  description: string;
  price: number;
  currency: string;
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  features: string[];
  maxUsers: number;
  isActive: boolean;
}

interface PaymentRecord {
  id: number;
  subscriptionId: number;
  userId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  transactionId?: string;
  billingPeriod: string;
  createdAt: string;
}

interface Subscription {
  id: number;
  userId: string;
  planId: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED' | 'FAILED';
  startDate: string;
  endDate: string;
  lastBillingDate: string;
  nextBillingDate: string;
  autoRenew: boolean;
  paymentMethod: string;
  stellarTransactionId?: string;
  plan?: SubscriptionPlan;
  payments?: PaymentRecord[];
}

interface SubscriptionAnalytics {
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

interface SubscriptionStore {
  subscriptions: Subscription[];
  plans: SubscriptionPlan[];
  analytics: SubscriptionAnalytics | null;
  loading: boolean;
  error: string | null;
  fetchUserSubscriptions: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchAnalytics: (period?: string) => Promise<void>;
  createSubscription: (data: {
    planId: string;
    billingPeriod: string;
    paymentMethod: string;
    autoRenew: boolean;
  }) => Promise<void>;
  cancelSubscription: (subscriptionId: number) => Promise<void>;
  renewSubscription: (subscriptionId: number) => Promise<void>;
  getSubscription: (subscriptionId: number) => Subscription | undefined;
  getActiveSubscription: () => Subscription | undefined;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const parseJson = async <T>(response: Response): Promise<T> => {
  return (await response.json()) as T;
};

export const useSubscriptionStore = create<SubscriptionStore>()(
  devtools(
    persist(
      (set, get) => ({
        subscriptions: [],
        plans: [],
        analytics: null,
        loading: false,
        error: null,

        fetchUserSubscriptions: async () => {
          try {
            set({ loading: true, error: null });
            const token = localStorage.getItem('auth_token');
            if (!token) {
              throw new Error('Authentication required');
            }

            const response = await fetch(`${API_BASE_URL}/subscriptions/user`, {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              throw new Error('Failed to fetch subscriptions');
            }

            const data = await parseJson<{ data?: Subscription[] }>(response);
            set({ subscriptions: data.data || [] });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to fetch subscriptions',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        fetchPlans: async () => {
          try {
            set({ loading: true, error: null });

            const response = await fetch(`${API_BASE_URL}/subscriptions/plans`, {
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              throw new Error('Failed to fetch plans');
            }

            const data = await parseJson<{ data?: SubscriptionPlan[] }>(response);
            set({ plans: data.data || [] });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to fetch plans',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        fetchAnalytics: async (period = '30d') => {
          try {
            set({ loading: true, error: null });
            const token = localStorage.getItem('auth_token');
            if (!token) {
              throw new Error('Authentication required');
            }

            const response = await fetch(
              `${API_BASE_URL}/subscriptions/admin/analytics?period=${period}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (!response.ok) {
              throw new Error('Failed to fetch analytics');
            }

            const data = await parseJson<{ data?: SubscriptionAnalytics | null }>(response);
            set({ analytics: data.data || null });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to fetch analytics',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        createSubscription: async (data) => {
          try {
            set({ loading: true, error: null });
            const token = localStorage.getItem('auth_token');
            if (!token) {
              throw new Error('Authentication required');
            }

            const response = await fetch(`${API_BASE_URL}/subscriptions/create`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                tier: data.planId,
                billingPeriod: data.billingPeriod,
                paymentMethod: data.paymentMethod,
                autoRenew: data.autoRenew,
              }),
            });

            if (!response.ok) {
              const errorData = await parseJson<{ message?: string }>(response);
              throw new Error(errorData.message || 'Failed to create subscription');
            }

            await get().fetchUserSubscriptions();
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to create subscription',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        cancelSubscription: async (subscriptionId) => {
          try {
            set({ loading: true, error: null });
            const token = localStorage.getItem('auth_token');
            if (!token) {
              throw new Error('Authentication required');
            }

            const response = await fetch(`${API_BASE_URL}/subscriptions/${subscriptionId}/cancel`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await parseJson<{ message?: string }>(response);
              throw new Error(errorData.message || 'Failed to cancel subscription');
            }

            await get().fetchUserSubscriptions();
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to cancel subscription',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        renewSubscription: async (subscriptionId) => {
          try {
            set({ loading: true, error: null });
            const token = localStorage.getItem('auth_token');
            if (!token) {
              throw new Error('Authentication required');
            }

            const response = await fetch(`${API_BASE_URL}/subscriptions/${subscriptionId}/renew`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await parseJson<{ message?: string }>(response);
              throw new Error(errorData.message || 'Failed to renew subscription');
            }

            await get().fetchUserSubscriptions();
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to renew subscription',
            });
            throw error;
          } finally {
            set({ loading: false });
          }
        },

        getSubscription: (subscriptionId) => {
          const { subscriptions } = get();
          return subscriptions.find((subscription) => subscription.id === subscriptionId);
        },

        getActiveSubscription: () => {
          const { subscriptions } = get();
          return subscriptions.find((subscription) => subscription.status === 'ACTIVE');
        },

        clearError: () => set({ error: null }),
        setLoading: (loading) => set({ loading }),
      }),
      {
        name: 'subscription-store',
        partialize: (state) => ({
          subscriptions: state.subscriptions,
          plans: state.plans,
          analytics: state.analytics,
        }),
      }
    ),
    {
      name: 'subscription-store',
    }
  )
);
