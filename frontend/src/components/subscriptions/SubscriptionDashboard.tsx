"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  SubscriptionPlan,
  Subscription,
  PaymentRecord,
  FrequencyType,
  FREQUENCY_OPTIONS,
} from "./types";

const SubscriptionDashboard: React.FC = () => {
  const { publicKey, isConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<
    "plans" | "my-subscriptions" | "payment-history" | "analytics"
  >("plans");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: "",
    description: "",
    amount: "",
    frequency: "monthly" as FrequencyType,
    token: "",
  });

  const [selectedSubscription, setSelectedSubscription] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/plans");
      if (!response.ok) throw new Error("Failed to fetch plans");
      const data = await response.json();
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/subscriptions/user/${publicKey}`
      );
      if (!response.ok) throw new Error("Failed to fetch subscriptions");
      const data = await response.json();
      setSubscriptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  const fetchPayments = useCallback(async (subscriptionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/subscriptions/payments/${subscriptionId}`
      );
      if (!response.ok) throw new Error("Failed to fetch payments");
      const data = await response.json();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    if (publicKey && isConnected) {
      fetchSubscriptions();
    }
  }, [publicKey, isConnected, fetchSubscriptions]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;

    setLoading(true);
    setError(null);
    try {
      const frequencyOption = FREQUENCY_OPTIONS.find(
        (opt) => opt.value === newPlan.frequency
      );
      const response = await fetch("/api/subscriptions/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: publicKey,
          name: newPlan.name,
          description: newPlan.description,
          amount: parseFloat(newPlan.amount) * 10000000,
          frequency: frequencyOption?.seconds || 2592000,
          token: newPlan.token,
        }),
      });
      if (!response.ok) throw new Error("Failed to create plan");
      setShowCreatePlan(false);
      setNewPlan({
        name: "",
        description: "",
        amount: "",
        frequency: "monthly",
        token: "",
      });
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!publicKey) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber: publicKey,
          plan_id: planId,
        }),
      });
      if (!response.ok) throw new Error("Failed to subscribe");
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!publicKey) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber: publicKey,
          subscription_id: subscriptionId,
        }),
      });
      if (!response.ok) throw new Error("Failed to cancel subscription");
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseSubscription = async (
    subscriptionId: string,
    pause: boolean
  ) => {
    if (!publicKey) return;

    setLoading(true);
    setError(null);
    try {
      const endpoint = pause ? "pause" : "resume";
      const response = await fetch(`/api/subscriptions/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber: publicKey,
          subscription_id: subscriptionId,
        }),
      });
      if (!response.ok)
        throw new Error(
          `Failed to ${pause ? "pause" : "resume"} subscription`
        );
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatAmount = (amount: number) => {
    return (amount / 10000000).toFixed(7);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "text-green-600 bg-green-100";
      case "Paused":
        return "text-yellow-600 bg-yellow-100";
      case "Cancelled":
        return "text-red-600 bg-red-100";
      case "Expired":
        return "text-gray-600 bg-gray-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Subscription Service</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex space-x-4 mb-6 border-b">
        {(
          [
            "plans",
            "my-subscriptions",
            "payment-history",
            "analytics",
          ] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-4 font-medium ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {tab
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      )}

      {!loading && activeTab === "plans" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Subscription Plans</h2>
            {isConnected && (
              <button
                onClick={() => setShowCreatePlan(!showCreatePlan)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                {showCreatePlan ? "Cancel" : "Create Plan"}
              </button>
            )}
          </div>

          {showCreatePlan && (
            <form
              onSubmit={handleCreatePlan}
              className="bg-gray-50 p-6 rounded-lg mb-6 space-y-4"
            >
              <h3 className="text-lg font-semibold">Create New Plan</h3>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newPlan.name}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, name: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={newPlan.description}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, description: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  rows={3}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Amount (XLM)
                  </label>
                  <input
                    type="number"
                    step="0.0000001"
                    value={newPlan.amount}
                    onChange={(e) =>
                      setNewPlan({ ...newPlan, amount: e.target.value })
                    }
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Frequency
                  </label>
                  <select
                    value={newPlan.frequency}
                    onChange={(e) =>
                      setNewPlan({
                        ...newPlan,
                        frequency: e.target.value as FrequencyType,
                      })
                    }
                    className="w-full p-2 border rounded"
                  >
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Token Address
                </label>
                <input
                  type="text"
                  value={newPlan.token}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, token: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  placeholder="Stellar asset contract address"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Create Plan
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      plan.active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {plan.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Amount:</span>{" "}
                    {formatAmount(plan.amount)} XLM
                  </p>
                  <p>
                    <span className="font-medium">Frequency:</span>{" "}
                    {FREQUENCY_OPTIONS.find(
                      (opt) => opt.seconds === plan.frequency
                    )?.label || `${plan.frequency}s`}
                  </p>
                </div>
                {isConnected && (
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={!plan.active || loading}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Subscribe
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && activeTab === "my-subscriptions" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">My Subscriptions</h2>
          {!isConnected ? (
            <p className="text-gray-600">
              Please connect your wallet to view subscriptions.
            </p>
          ) : subscriptions.length === 0 ? (
            <p className="text-gray-600">No subscriptions found.</p>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">
                        Plan: {sub.plan_id.slice(0, 8)}...
                      </h3>
                      <p className="text-sm text-gray-600">
                        Subscription ID: {sub.id.slice(0, 16)}...
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${getStatusColor(
                        sub.status
                      )}`}
                    >
                      {sub.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Amount:</span>
                      <p>{formatAmount(sub.amount)} XLM</p>
                    </div>
                    <div>
                      <span className="font-medium">Total Paid:</span>
                      <p>{formatAmount(sub.total_paid)} XLM</p>
                    </div>
                    <div>
                      <span className="font-medium">Next Payment:</span>
                      <p>{formatDate(sub.next_payment)}</p>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>
                      <p>{formatDate(sub.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {sub.status === "Active" && (
                      <>
                        <button
                          onClick={() =>
                            handlePauseSubscription(sub.id, true)
                          }
                          className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm"
                        >
                          Pause
                        </button>
                        <button
                          onClick={() =>
                            handleCancelSubscription(sub.id)
                          }
                          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {sub.status === "Paused" && (
                      <button
                        onClick={() =>
                          handlePauseSubscription(sub.id, false)
                        }
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedSubscription(sub.id);
                        setActiveTab("payment-history");
                        fetchPayments(sub.id);
                      }}
                      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm"
                    >
                      View Payments
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === "payment-history" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Payment History
            {selectedSubscription && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                for {selectedSubscription.slice(0, 16)}...
              </span>
            )}
          </h2>
          {payments.length === 0 ? (
            <p className="text-gray-600">No payment records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border p-2 text-left">Date</th>
                    <th className="border p-2 text-left">Amount</th>
                    <th className="border p-2 text-left">Status</th>
                    <th className="border p-2 text-left">Retry Count</th>
                    <th className="border p-2 text-left">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="border p-2">
                        {formatDate(payment.timestamp)}
                      </td>
                      <td className="border p-2">
                        {formatAmount(payment.amount)} XLM
                      </td>
                      <td className="border p-2">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            payment.status === "Success"
                              ? "bg-green-100 text-green-800"
                              : payment.status === "Failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="border p-2">{payment.retry_count}</td>
                      <td className="border p-2 text-xs">
                        {payment.tx_hash.slice(0, 16)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === "analytics" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Subscription Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-600">
                Total Subscriptions
              </h3>
              <p className="text-2xl font-bold">
                {subscriptions.length}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-green-600">
                Active Subscriptions
              </h3>
              <p className="text-2xl font-bold">
                {
                  subscriptions.filter((s) => s.status === "Active").length
                }
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-red-600">
                Cancelled
              </h3>
              <p className="text-2xl font-bold">
                {
                  subscriptions.filter((s) => s.status === "Cancelled")
                    .length
                }
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-purple-600">
                Total Revenue
              </h3>
              <p className="text-2xl font-bold">
                {formatAmount(
                  subscriptions.reduce((sum, s) => sum + s.total_paid, 0)
                )}{" "}
                XLM
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionDashboard;
