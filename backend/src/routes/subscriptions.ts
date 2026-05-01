import { Request, Response, Router } from 'express';

const router = Router();

// Mock database
interface MockSubscriptionPlan {
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

interface MockSubscription {
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
}

interface MockPayment {
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

let plans: MockSubscriptionPlan[] = [];
let subscriptions: MockSubscription[] = [];
let payments: MockPayment[] = [];

// GET /api/subscriptions/plans - Get all plans
router.get('/plans', async (req: Request, res: Response) => {
  try {
    res.json(plans);
  } catch {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// POST /api/subscriptions/plans - Create a new plan
router.post('/plans', async (req: Request, res: Response) => {
  try {
    const { merchant, name, description, amount, frequency, token } = req.body;

    if (!merchant || !name || !amount || !frequency || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newPlan: MockSubscriptionPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: description || '',
      amount,
      frequency,
      token,
      active: true,
      created_at: Math.floor(Date.now() / 1000),
      merchant,
    };

    plans.push(newPlan);
    res.status(201).json(newPlan);
  } catch {
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// GET /api/subscriptions/user/:userKey - Get user subscriptions
router.get('/user/:userKey', async (req: Request, res: Response) => {
  try {
    const { userKey } = req.params;
    const userSubscriptions = subscriptions.filter((s) => s.subscriber === userKey);
    res.json(userSubscriptions);
  } catch {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// POST /api/subscriptions/subscribe - Subscribe to a plan
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { subscriber, plan_id } = req.body;

    if (!subscriber || !plan_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const plan = plans.find((p) => p.id === plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const existing = subscriptions.find(
      (s) => s.plan_id === plan_id && s.subscriber === subscriber && s.status === 'Active'
    );
    if (existing) {
      return res.status(409).json({ error: 'Already subscribed' });
    }

    const now = Math.floor(Date.now() / 1000);
    const newSubscription: MockSubscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      plan_id,
      subscriber,
      merchant: plan.merchant,
      amount: plan.amount,
      frequency: plan.frequency,
      token: plan.token,
      status: 'Active',
      created_at: now,
      next_payment: now + plan.frequency,
      last_payment: 0,
      cancelled_at: 0,
      pause_start: 0,
      total_paid: 0,
    };

    subscriptions.push(newSubscription);
    res.status(201).json(newSubscription);
  } catch {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { subscriber, subscription_id } = req.body;

    const subIndex = subscriptions.findIndex(
      (s) => s.id === subscription_id && s.subscriber === subscriber
    );

    if (subIndex === -1) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subscriptions[subIndex];
    if (subscription.status === 'Cancelled') {
      return res.status(400).json({ error: 'Already cancelled' });
    }

    const now = Math.floor(Date.now() / 1000);
    const refund = subscription.last_payment > 0 ? 
      Math.floor((subscription.amount * (subscription.frequency - (now - subscription.last_payment))) / subscription.frequency) : 0;

    subscriptions[subIndex] = {
      ...subscription,
      status: 'Cancelled',
      cancelled_at: now,
    };

    res.json({ refund_amount: refund });
  } catch {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /api/subscriptions/pause - Pause subscription
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const { subscriber, subscription_id } = req.body;

    const subIndex = subscriptions.findIndex(
      (s) => s.id === subscription_id && s.subscriber === subscriber
    );

    if (subIndex === -1) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subscriptions[subIndex];
    if (subscription.status === 'Paused') {
      return res.status(400).json({ error: 'Already paused' });
    }

    const now = Math.floor(Date.now() / 1000);

    subscriptions[subIndex] = {
      ...subscription,
      status: 'Paused',
      pause_start: now,
    };

    res.json(subscriptions[subIndex]);
  } catch {
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
});

// POST /api/subscriptions/resume - Resume subscription
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { subscriber, subscription_id } = req.body;

    const subIndex = subscriptions.findIndex(
      (s) => s.id === subscription_id && s.subscriber === subscriber
    );

    if (subIndex === -1) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subscriptions[subIndex];
    if (subscription.status !== 'Paused') {
      return res.status(400).json({ error: 'Subscription is not paused' });
    }

    const now = Math.floor(Date.now() / 1000);
    const pauseDuration = now - subscription.pause_start;
    const nextPayment = (subscription.last_payment > 0 ? subscription.last_payment : subscription.created_at) + subscription.frequency + pauseDuration;

    subscriptions[subIndex] = {
      ...subscription,
      status: 'Active',
      next_payment: nextPayment,
      pause_start: 0,
    };

    res.json(subscriptions[subIndex]);
  } catch {
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

// GET /api/subscriptions/payments/:subscriptionId - Get payment history
router.get('/payments/:subscriptionId', async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const subscriptionPayments = payments.filter((p) => p.subscription_id === subscriptionId);
    res.json(subscriptionPayments);
  } catch {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST /api/subscriptions/execute-payment - Execute a payment
router.post('/execute-payment', async (req: Request, res: Response) => {
  try {
    const { subscription_id } = req.body;

    const subscription = subscriptions.find((s) => s.id === subscription_id);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (subscription.status !== 'Active') {
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < subscription.next_payment) {
      return res.status(400).json({ error: 'Payment not due yet' });
    }

    const newPayment: MockPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      subscription_id,
      subscriber: subscription.subscriber,
      merchant: subscription.merchant,
      amount: subscription.amount,
      token: subscription.token,
      timestamp: now,
      status: 'Success',
      retry_count: 0,
      tx_hash: `0x${Math.random().toString(16).substr(2, 64)}`,
    };

    payments.push(newPayment);

    const subIndex = subscriptions.findIndex((s) => s.id === subscription_id);
    subscriptions[subIndex] = {
      ...subscription,
      last_payment: now,
      next_payment: now + subscription.frequency,
      total_paid: subscription.total_paid + subscription.amount,
    };

    res.json({ payment_id: newPayment.id });
  } catch {
    res.status(500).json({ error: 'Failed to execute payment' });
  }
});

// POST /api/subscriptions/retry-payment - Retry failed payment
router.post('/retry-payment', async (req: Request, res: Response) => {
  try {
    const { subscription_id } = req.body;

    const subscription = subscriptions.find((s) => s.id === subscription_id);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const now = Math.floor(Date.now() / 1000);
    const newPayment: MockPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      subscription_id,
      subscriber: subscription.subscriber,
      merchant: subscription.merchant,
      amount: subscription.amount,
      token: subscription.token,
      timestamp: now,
      status: 'Retried',
      retry_count: 1,
      tx_hash: `0x${Math.random().toString(16).substr(2, 64)}`,
    };

    payments.push(newPayment);

    res.json({ payment_id: newPayment.id });
  } catch {
    res.status(500).json({ error: 'Failed to retry payment' });
  }
});

// GET /api/subscriptions/failed-payments - Get failed payments (admin)
router.get('/failed-payments', async (req: Request, res: Response) => {
  try {
    const failed = payments.filter((p) => p.status === 'Failed');
    res.json(failed);
  } catch {
    res.status(500).json({ error: 'Failed to fetch failed payments' });
  }
});

// GET /api/subscriptions/analytics/:merchantKey - Get analytics
router.get('/analytics/:merchantKey', async (req: Request, res: Response) => {
  try {
    const { merchantKey } = req.params;
    const merchantSubs = subscriptions.filter((s) => s.merchant === merchantKey);

    const analytics = {
      total_subscriptions: merchantSubs.length,
      active_subscriptions: merchantSubs.filter((s) => s.status === 'Active').length,
      cancelled_subscriptions: merchantSubs.filter((s) => s.status === 'Cancelled').length,
      total_revenue: merchantSubs.reduce((sum, s) => sum + s.total_paid, 0),
      monthly_revenue: merchantSubs
        .filter((s) => s.last_payment > Math.floor(Date.now() / 1000) - 2592000)
        .reduce((sum, s) => sum + s.amount, 0),
      average_subscription_length: merchantSubs.length > 0
        ? merchantSubs.reduce((sum, s) => sum + (s.last_payment - s.created_at), 0) / merchantSubs.length
        : 0,
    };

    res.json(analytics);
  } catch {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
