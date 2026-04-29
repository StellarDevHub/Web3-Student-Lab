import React, { useState, useEffect } from 'react';
import './SubscriptionDashboard.css';

// Types derived from contract logic
export type SubscriptionStatus = 'Active' | 'Paused' | 'Cancelled';
export type BillingFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export interface Subscription {
  id: string;
  planName: string;
  price: number;
  frequency: BillingFrequency;
  status: SubscriptionStatus;
  nextPaymentAt: string;
  createdAt: string;
}

export interface PaymentHistory {
  id: string;
  subId: string;
  amount: number;
  timestamp: string;
  status: 'Success' | 'Failed' | 'Retrying';
}

const mockSubscriptions: Subscription[] = [
  {
    id: '101',
    planName: 'Premium VPN',
    price: 9.99,
    frequency: 'Monthly',
    status: 'Active',
    nextPaymentAt: '2026-05-29',
    createdAt: '2026-04-29',
  },
  {
    id: '102',
    planName: 'Game Pass Pro',
    price: 59.99,
    frequency: 'Yearly',
    status: 'Paused',
    nextPaymentAt: '2026-10-15',
    createdAt: '2025-10-15',
  },
];

const mockPayments: PaymentHistory[] = [
  { id: 'p1', subId: '101', amount: 9.99, timestamp: '2026-04-29 09:00', status: 'Success' },
  { id: 'p2', subId: '101', amount: 9.99, timestamp: '2026-03-29 09:00', status: 'Success' },
  { id: 'p3', subId: '102', amount: 59.99, timestamp: '2025-10-15 10:00', status: 'Success' },
];

export const SubscriptionDashboard: React.FC = () => {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulating API fetch
    setTimeout(() => {
      setSubs(mockSubscriptions);
      setPayments(mockPayments);
      setLoading(false);
    }, 800);
  }, []);

  const handleAction = (id: string, action: string) => {
    console.log(`${action} subscription ${id}`);
    alert(`${action} initiated for subscription #${id}`);
  };

  const getStatusColor = (status: SubscriptionStatus) => {
    switch (status) {
      case 'Active': return '#48bb78';
      case 'Paused': return '#ecc94b';
      case 'Cancelled': return '#f56565';
      default: return '#a0aec0';
    }
  };

  return (
    <div className="subscription-dashboard">
      <header className="dashboard-header">
        <h1>Subscription Dashboard</h1>
        <p className="subtitle">Manage your decentralized recurring payments</p>
      </header>

      {loading ? (
        <div className="loader">Loading your subscriptions...</div>
      ) : (
        <div className="dashboard-content">
          <section className="active-subscriptions">
            <h2>Active Subscriptions</h2>
            <div className="sub-grid">
              {subs.map((sub) => (
                <div key={sub.id} className="sub-card">
                  <div className="card-header">
                    <h3>{sub.planName}</h3>
                    <span className="status-badge" style={{ backgroundColor: getStatusColor(sub.status) }}>
                      {sub.status}
                    </span>
                  </div>
                  <div className="card-body">
                    <p className="price">
                      <span className="amount">${sub.price}</span>
                      <span className="frequency">/{sub.frequency}</span>
                    </p>
                    <div className="details">
                      <p><strong>Sub ID:</strong> #{sub.id}</p>
                      <p><strong>Next Payment:</strong> {sub.nextPaymentAt}</p>
                    </div>
                  </div>
                  <div className="card-actions">
                    {sub.status === 'Active' && (
                      <button className="btn btn-pause" onClick={() => handleAction(sub.id, 'Pause')}>Pause</button>
                    )}
                    {sub.status === 'Paused' && (
                      <button className="btn btn-resume" onClick={() => handleAction(sub.id, 'Resume')}>Resume</button>
                    )}
                    <button className="btn btn-cancel" onClick={() => handleAction(sub.id, 'Cancel')}>Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="payment-history">
            <h2>Payment History</h2>
            <div className="table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Subscription</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.timestamp}</td>
                      <td>#{p.subId}</td>
                      <td>${p.amount}</td>
                      <td>
                        <span className={`status-text ${p.status.toLowerCase()}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="subscription-analytics">
            <h2>Analytics Overview</h2>
            <div className="analytics-grid">
              <div className="analytics-card">
                <span className="label">Total Monthly Burn</span>
                <span className="value">$69.98</span>
              </div>
              <div className="analytics-card">
                <span className="label">Active Services</span>
                <span className="value">2</span>
              </div>
              <div className="analytics-card">
                <span className="label">Savings (Paused)</span>
                <span className="value">$0.00</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
