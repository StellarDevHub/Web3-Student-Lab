'use client';

import { useWallet } from '@/contexts/WalletContext';
import {
    AlertCircle,
    Calendar,
    CheckCircle,
    Clock,
    Loader2,
    Pause,
    Play,
    Plus,
    Trash2,
    TrendingUp,
    X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

/**
 * SchedulerDashboard Component
 *
 * Provides a comprehensive interface for managing recurring token payment schedules.
 * Allows users to:
 * - Create new payment schedules with custom intervals and conditions
 * - View and manage existing schedules (pause, resume, cancel)
 * - Track execution history and success rates
 * - View analytics on total transfers and schedule status
 *
 * # Data Dependencies
 * - Requires wallet connection via WalletContext
 * - Fetches schedules from payment scheduler smart contract
 * - Queries execution history for analytics
 *
 * # Accessibility
 * - All form inputs have associated labels
 * - Interactive elements have appropriate ARIA attributes
 * - Loading and error states are clearly communicated
 * - Keyboard navigation supported throughout
 */

interface PaymentSchedule {
  id: string;
  recipient: string;
  token: string;
  amount: number;
  interval: string;
  intervalSeconds: number;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  nextExecution: Date;
  executionCount: number;
  maxExecutions?: number;
  createdAt: Date;
}

interface ExecutionRecord {
  timestamp: Date;
  status: 'success' | 'failed';
  retryCount: number;
  failureReason?: string;
  amountTransferred?: number;
}

interface ScheduleFormData {
  recipient: string;
  token: string;
  amount: string;
  interval: string;
  customIntervalSeconds?: string;
  maxExecutions?: string;
  conditions: string[];
}

const INTERVAL_OPTIONS = [
  { label: 'Daily', value: 'daily', seconds: 86400 },
  { label: 'Weekly', value: 'weekly', seconds: 604800 },
  { label: 'Monthly', value: 'monthly', seconds: 2592000 },
  { label: 'Custom', value: 'custom', seconds: 0 },
];

const SUPPORTED_TOKENS = [
  { symbol: 'RST', name: 'RS-Token', address: 'CRST...' },
  { symbol: 'XLM', name: 'Stellar Lumens', address: 'CXLM...' },
  { symbol: 'USDC', name: 'USD Coin', address: 'CUSDC...' },
];

export const SchedulerDashboard: React.FC = () => {
  const { publicKey, isConnected } = useWallet();
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<PaymentSchedule | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [formData, setFormData] = useState<ScheduleFormData>({
    recipient: '',
    token: 'RST',
    amount: '',
    interval: 'daily',
    maxExecutions: '',
    conditions: [],
  });

  // Fetch schedules on mount and when wallet changes
  useEffect(() => {
    if (isConnected && publicKey) {
      fetchSchedules();
    }
  }, [isConnected, publicKey]);

  const fetchSchedules = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // In production, this would call the payment scheduler contract
      // For now, we simulate fetching schedules
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock data for demonstration
      const mockSchedules: PaymentSchedule[] = [
        {
          id: '1',
          recipient: 'GDEF...456',
          token: 'RST',
          amount: 100,
          interval: 'daily',
          intervalSeconds: 86400,
          status: 'active',
          nextExecution: new Date(Date.now() + 86400000),
          executionCount: 5,
          maxExecutions: 30,
          createdAt: new Date(Date.now() - 432000000),
        },
      ];

      setSchedules(mockSchedules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schedules');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validate form
      if (!formData.recipient || !formData.amount) {
        throw new Error('Please fill in all required fields');
      }

      const amount = parseFloat(formData.amount);
      if (amount <= 0) {
        throw new Error('Amount must be positive');
      }

      // In production, this would call the payment scheduler contract
      // For now, we simulate schedule creation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Add new schedule to list
      const newSchedule: PaymentSchedule = {
        id: String(schedules.length + 1),
        recipient: formData.recipient,
        token: formData.token,
        amount,
        interval: formData.interval,
        intervalSeconds:
          formData.interval === 'custom'
            ? parseInt(formData.customIntervalSeconds || '0')
            : INTERVAL_OPTIONS.find((opt) => opt.value === formData.interval)?.seconds || 0,
        status: 'active',
        nextExecution: new Date(Date.now() + 86400000),
        executionCount: 0,
        maxExecutions: formData.maxExecutions ? parseInt(formData.maxExecutions) : undefined,
        createdAt: new Date(),
      };

      setSchedules([...schedules, newSchedule]);
      setShowCreateForm(false);
      setFormData({
        recipient: '',
        token: 'RST',
        amount: '',
        interval: 'daily',
        maxExecutions: '',
        conditions: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseSchedule = async (scheduleId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // In production, this would call the payment scheduler contract
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSchedules(
        schedules.map((s) =>
          s.id === scheduleId ? { ...s, status: 'paused' as const } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResumeSchedule = async (scheduleId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // In production, this would call the payment scheduler contract
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSchedules(
        schedules.map((s) =>
          s.id === scheduleId ? { ...s, status: 'active' as const } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to cancel this schedule?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In production, this would call the payment scheduler contract
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSchedules(
        schedules.map((s) =>
          s.id === scheduleId ? { ...s, status: 'cancelled' as const } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewHistory = async (schedule: PaymentSchedule) => {
    setSelectedSchedule(schedule);
    setIsLoading(true);

    try {
      // In production, this would fetch execution history from contract
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock execution history
      const mockHistory: ExecutionRecord[] = [
        {
          timestamp: new Date(Date.now() - 86400000),
          status: 'success',
          retryCount: 0,
          amountTransferred: 100,
        },
        {
          timestamp: new Date(Date.now() - 172800000),
          status: 'success',
          retryCount: 0,
          amountTransferred: 100,
        },
      ];

      setExecutionHistory(mockHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch execution history');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAnalytics = () => {
    const totalSchedules = schedules.length;
    const activeSchedules = schedules.filter((s) => s.status === 'active').length;
    const totalTransferred = schedules.reduce((sum, s) => sum + s.amount * s.executionCount, 0);
    const successRate =
      executionHistory.length > 0
        ? (executionHistory.filter((e) => e.status === 'success').length /
            executionHistory.length) *
          100
        : 0;

    return { totalSchedules, activeSchedules, totalTransferred, successRate };
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">Wallet Not Connected</h2>
          <p className="text-gray-600">Please connect your wallet to manage payment schedules.</p>
        </div>
      </div>
    );
  }

  const analytics = calculateAnalytics();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Scheduler</h1>
          <p className="text-gray-600">
            Manage recurring token transfers with conditional execution
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Analytics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Schedules</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.totalSchedules}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Active Schedules</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.activeSchedules}</p>
              </div>
              <Play className="h-8 w-8 text-green-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Transferred</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {analytics.totalTransferred.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Success Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {analytics.successRate.toFixed(1)}%
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-500 opacity-20" />
            </div>
          </div>
        </div>

        {/* Create Schedule Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            aria-label="Create new payment schedule"
          >
            <Plus className="h-5 w-5" />
            Create Schedule
          </button>
        </div>

        {/* Create Schedule Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Create New Schedule</h2>

            <form onSubmit={handleCreateSchedule} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recipient */}
                <div>
                  <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Address *
                  </label>
                  <input
                    id="recipient"
                    type="text"
                    placeholder="GDEF...456"
                    value={formData.recipient}
                    onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Token */}
                <div>
                  <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                    Token *
                  </label>
                  <select
                    id="token"
                    value={formData.token}
                    onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_TOKENS.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.name} ({token.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                    Amount *
                  </label>
                  <input
                    id="amount"
                    type="number"
                    placeholder="100"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Interval */}
                <div>
                  <label htmlFor="interval" className="block text-sm font-medium text-gray-700 mb-2">
                    Interval *
                  </label>
                  <select
                    id="interval"
                    value={formData.interval}
                    onChange={(e) => setFormData({ ...formData, interval: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Interval */}
                {formData.interval === 'custom' && (
                  <div>
                    <label
                      htmlFor="customInterval"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Interval (seconds) *
                    </label>
                    <input
                      id="customInterval"
                      type="number"
                      placeholder="3600"
                      value={formData.customIntervalSeconds || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, customIntervalSeconds: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      min="1"
                    />
                  </div>
                )}

                {/* Max Executions */}
                <div>
                  <label
                    htmlFor="maxExecutions"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Max Executions (optional)
                  </label>
                  <input
                    id="maxExecutions"
                    type="number"
                    placeholder="30"
                    value={formData.maxExecutions}
                    onChange={(e) => setFormData({ ...formData, maxExecutions: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors font-medium"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Schedule
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Schedules List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Your Schedules</h2>
          </div>

          {isLoading && !schedules.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600">No schedules yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Interval
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Next Execution
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Executions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {schedule.recipient}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.amount} {schedule.token}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {schedule.interval}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full ${
                            schedule.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : schedule.status === 'paused'
                                ? 'bg-yellow-100 text-yellow-800'
                                : schedule.status === 'completed'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {schedule.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {schedule.nextExecution.toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.executionCount}
                        {schedule.maxExecutions && `/${schedule.maxExecutions}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        {schedule.status === 'active' && (
                          <button
                            onClick={() => handlePauseSchedule(schedule.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
                            aria-label={`Pause schedule ${schedule.id}`}
                          >
                            <Pause className="h-3 w-3" />
                            Pause
                          </button>
                        )}
                        {schedule.status === 'paused' && (
                          <button
                            onClick={() => handleResumeSchedule(schedule.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                            aria-label={`Resume schedule ${schedule.id}`}
                          >
                            <Play className="h-3 w-3" />
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => handleViewHistory(schedule)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          aria-label={`View history for schedule ${schedule.id}`}
                        >
                          <Clock className="h-3 w-3" />
                          History
                        </button>
                        <button
                          onClick={() => handleCancelSchedule(schedule.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                          aria-label={`Cancel schedule ${schedule.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Execution History Modal */}
        {selectedSchedule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  Execution History - {selectedSchedule.recipient}
                </h3>
                <button
                  onClick={() => {
                    setSelectedSchedule(null);
                    setExecutionHistory([]);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Close execution history"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 py-4">
                {executionHistory.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No execution history yet.</p>
                ) : (
                  <div className="space-y-4">
                    {executionHistory.map((record, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-shrink-0 mt-1">
                          {record.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">
                              {record.status === 'success' ? 'Successful' : 'Failed'}
                            </span>
                            <span className="text-xs text-gray-600">
                              {record.timestamp.toLocaleString()}
                            </span>
                          </div>
                          {record.amountTransferred && (
                            <p className="text-sm text-gray-600">
                              Amount: {record.amountTransferred} {selectedSchedule.token}
                            </p>
                          )}
                          {record.failureReason && (
                            <p className="text-sm text-red-600">Reason: {record.failureReason}</p>
                          )}
                          {record.retryCount > 0 && (
                            <p className="text-sm text-gray-600">Retries: {record.retryCount}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchedulerDashboard;
