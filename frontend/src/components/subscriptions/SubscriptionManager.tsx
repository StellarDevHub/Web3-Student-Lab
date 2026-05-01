'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  CreditCard, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Settings,
  TrendingUp,
  Users,
  Clock
} from 'lucide-react';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatCurrency, formatDate } from '@/utils/format';

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

export const SubscriptionManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const {
    subscriptions,
    plans,
    analytics,
    fetchUserSubscriptions,
    fetchPlans,
    fetchAnalytics,
    createSubscription,
    cancelSubscription,
    renewSubscription
  } = useSubscriptionStore();

  const { lastMessage, sendMessage } = useWebSocket();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await Promise.all([
        fetchUserSubscriptions(),
        fetchPlans(),
        fetchAnalytics()
      ]);
    } catch (err) {
      setError('Failed to load subscription data');
      console.error('Error loading subscription data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'subscription_created':
        fetchUserSubscriptions();
        break;
      case 'subscription_cancelled':
        fetchUserSubscriptions();
        break;
      case 'subscription_renewed':
        fetchUserSubscriptions();
        break;
      case 'plan_updated':
        fetchPlans();
        break;
      case 'contract_paused':
        setError('Subscription contract is currently paused');
        break;
      case 'contract_unpaused':
        setError(null);
        break;
      default:
        break;
    }
  };

  const handleCreateSubscription = async (planId: string, billingPeriod: string) => {
    try {
      await createSubscription({
        planId,
        billingPeriod,
        paymentMethod: 'stellar',
        autoRenew: true
      });
    } catch (err) {
      setError('Failed to create subscription');
      console.error('Error creating subscription:', err);
    }
  };

  const handleCancelSubscription = async (subscriptionId: number) => {
    try {
      await cancelSubscription(subscriptionId);
    } catch (err) {
      setError('Failed to cancel subscription');
      console.error('Error cancelling subscription:', err);
    }
  };

  const handleRenewSubscription = async (subscriptionId: number) => {
    try {
      await renewSubscription(subscriptionId);
    } catch (err) {
      setError('Failed to renew subscription');
      console.error('Error renewing subscription:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      case 'EXPIRED':
        return 'bg-orange-100 text-orange-800';
      case 'PAUSED':
        return 'bg-yellow-100 text-yellow-800';
      case 'SUSPENDED':
        return 'bg-purple-100 text-purple-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="w-4 h-4" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4" />;
      case 'EXPIRED':
        return <Clock className="w-4 h-4" />;
      case 'PAUSED':
        return <AlertTriangle className="w-4 h-4" />;
      case 'SUSPENDED':
        return <AlertTriangle className="w-4 h-4" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const calculateDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const calculateProgress = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscription Management</h1>
          <p className="text-muted-foreground">Manage your subscription plans and billing</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {subscriptions.filter(s => s.status === 'ACTIVE').length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analytics?.revenue || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New Subscriptions</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics?.newSubscriptions || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics?.churnRate?.toFixed(1) || 0}%
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your Subscriptions</CardTitle>
              <CardDescription>Manage your active and inactive subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              {subscriptions.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active subscriptions</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => setActiveTab('plans')}
                  >
                    Browse Plans
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {subscriptions.map((subscription) => (
                    <Card key={subscription.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold">{subscription.plan?.name}</h3>
                              <Badge className={getStatusColor(subscription.status)}>
                                <div className="flex items-center space-x-1">
                                  {getStatusIcon(subscription.status)}
                                  <span>{subscription.status}</span>
                                </div>
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {subscription.plan?.description}
                            </p>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>Started: {formatDate(subscription.startDate)}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>Ends: {formatDate(subscription.endDate)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-right">
                              <div className="font-semibold">
                                {formatCurrency(subscription.plan?.price || 0)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {subscription.plan?.billingPeriod}
                              </div>
                            </div>
                            <div className="flex flex-col space-y-2">
                              {subscription.status === 'ACTIVE' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                >
                                  Cancel
                                </Button>
                              )}
                              {subscription.status === 'ACTIVE' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleRenewSubscription(subscription.id)}
                                >
                                  Renew
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {subscription.status === 'ACTIVE' && (
                          <div className="mt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Subscription Progress</span>
                              <span>{calculateDaysRemaining(subscription.endDate)} days remaining</span>
                            </div>
                            <Progress 
                              value={calculateProgress(subscription.startDate, subscription.endDate)} 
                              className="h-2"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan.id} className="relative">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {plan.name}
                    {plan.tier === 'PRO' && (
                      <Badge className="bg-blue-100 text-blue-800">Popular</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold">
                      {formatCurrency(plan.price)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      per {plan.billingPeriod.toLowerCase()}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold">Features:</h4>
                    <ul className="space-y-1">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Up to {plan.maxUsers} users
                  </div>

                  <Button 
                    className="w-full"
                    disabled={!plan.isActive}
                    onClick={() => handleCreateSubscription(plan.id, plan.billingPeriod)}
                  >
                    {plan.isActive ? 'Subscribe Now' : 'Plan Unavailable'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>View your subscription payment history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {subscriptions.flatMap(sub => 
                  sub.payments?.map(payment => (
                    <div key={payment.id} className="flex items-center justify-between p-4 border rounded">
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {formatCurrency(payment.amount)} {payment.currency}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(payment.createdAt)} - {payment.billingPeriod}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(payment.status)}>
                          {payment.status}
                        </Badge>
                        {payment.transactionId && (
                          <Button size="sm" variant="outline">
                            View Receipt
                          </Button>
                        )}
                      </div>
                    </div>
                  )) || []
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Subscriptions</span>
                    <span className="font-semibold">{analytics?.totalSubscriptions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Subscriptions</span>
                    <span className="font-semibold">{analytics?.activeSubscriptions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>New This Month</span>
                    <span className="font-semibold">{analytics?.newSubscriptions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cancelled This Month</span>
                    <span className="font-semibold">{analytics?.cancelledSubscriptions || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Revenue</span>
                    <span className="font-semibold">
                      {formatCurrency(analytics?.revenue || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Churn Rate</span>
                    <span className="font-semibold">
                      {analytics?.churnRate?.toFixed(1) || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Period</span>
                    <span className="font-semibold">{analytics?.period || '30d'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
