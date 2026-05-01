/**
 * usePaymentScheduler Hook
 *
 * Custom React hook for interacting with the payment scheduler smart contract.
 * Handles contract calls, state management, and error handling for payment schedule operations.
 *
 * # Usage
 * ```typescript
 * const {
 *   schedules,
 *   isLoading,
 *   error,
 *   createSchedule,
 *   pauseSchedule,
 *   resumeSchedule,
 *   cancelSchedule,
 *   getExecutionHistory,
 * } = usePaymentScheduler();
 * ```
 *
 * # Data Dependencies
 * - Requires wallet connection via WalletContext
 * - Fetches data from payment scheduler contract on Soroban
 *
 * # Error Handling
 * All contract calls return structured error objects with descriptive messages
 */

import { useWallet } from '@/contexts/WalletContext';
import { useCallback, useEffect, useState } from 'react';

export interface PaymentSchedule {
  id: string;
  owner: string;
  recipient: string;
  tokenAddress: string;
  amount: number;
  interval: number;
  nextExecution: number;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  createdAt: number;
  executionCount: number;
  maxExecutions?: number;
  conditions: Condition[];
}

export interface Condition {
  type: 'balance' | 'timeWindow' | 'custom';
  params: Record<string, unknown>;
}

export interface ExecutionRecord {
  scheduleId: string;
  executedAt: number;
  success: boolean;
  failureReason?: string;
  retryCount: number;
  amountTransferred?: number;
}

export interface UsePaymentSchedulerReturn {
  schedules: PaymentSchedule[];
  isLoading: boolean;
  error: string | null;
  createSchedule: (params: CreateScheduleParams) => Promise<string>;
  pauseSchedule: (scheduleId: string) => Promise<void>;
  resumeSchedule: (scheduleId: string) => Promise<void>;
  cancelSchedule: (scheduleId: string) => Promise<void>;
  getExecutionHistory: (scheduleId: string, limit: number) => Promise<ExecutionRecord[]>;
  getOwnerSchedules: (owner: string) => Promise<PaymentSchedule[]>;
  refreshSchedules: () => Promise<void>;
}

export interface CreateScheduleParams {
  recipient: string;
  tokenAddress: string;
  amount: number;
  interval: number;
  maxExecutions?: number;
  conditions?: Condition[];
}

/**
 * Hook for managing payment schedules
 *
 * @returns Object containing schedules, loading state, error state, and contract interaction functions
 */
export const usePaymentScheduler = (): UsePaymentSchedulerReturn => {
  const { publicKey, isConnected } = useWallet();
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch schedules on mount and when wallet changes
  useEffect(() => {
    if (isConnected && publicKey) {
      refreshSchedules();
    }
  }, [isConnected, publicKey]);

  /**
   * Refresh schedules from contract
   */
  const refreshSchedules = useCallback(async () => {
    if (!publicKey) return;

    setIsLoading(true);
    setError(null);

    try {
      // In production, this would call the payment scheduler contract
      // const client = new PaymentSchedulerClient(env, contractId);
      // const scheduleIds = await client.getOwnerSchedules(publicKey);
      // const schedules = await Promise.all(
      //   scheduleIds.map(id => client.getSchedule(id))
      // );
      // setSchedules(schedules);

      // For now, return empty array
      setSchedules([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch schedules';
      setError(errorMessage);
      console.error('Error fetching schedules:', err);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  /**
   * Create a new payment schedule
   */
  const createSchedule = useCallback(
    async (params: CreateScheduleParams): Promise<string> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        // In production, this would:
        // 1. Build a Soroban transaction calling create_schedule
        // 2. Sign it with the wallet
        // 3. Submit to the network
        // 4. Wait for confirmation
        // 5. Return the schedule ID

        // For now, simulate the call
        const scheduleId = `schedule_${Date.now()}`;

        // Refresh schedules after creation
        await refreshSchedules();

        return scheduleId;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, refreshSchedules]
  );

  /**
   * Pause a schedule
   */
  const pauseSchedule = useCallback(
    async (scheduleId: string): Promise<void> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        // In production, this would call pause_schedule on the contract

        // Update local state
        setSchedules((prev) =>
          prev.map((s) => (s.id === scheduleId ? { ...s, status: 'paused' as const } : s))
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to pause schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey]
  );

  /**
   * Resume a paused schedule
   */
  const resumeSchedule = useCallback(
    async (scheduleId: string): Promise<void> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        // In production, this would call resume_schedule on the contract

        // Update local state
        setSchedules((prev) =>
          prev.map((s) => (s.id === scheduleId ? { ...s, status: 'active' as const } : s))
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to resume schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey]
  );

  /**
   * Cancel a schedule
   */
  const cancelSchedule = useCallback(
    async (scheduleId: string): Promise<void> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        // In production, this would call cancel_schedule on the contract

        // Update local state
        setSchedules((prev) =>
          prev.map((s) => (s.id === scheduleId ? { ...s, status: 'cancelled' as const } : s))
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to cancel schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey]
  );

  /**
   * Get execution history for a schedule
   */
  const getExecutionHistory = useCallback(
    async (scheduleId: string, limit: number = 10): Promise<ExecutionRecord[]> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      try {
        // In production, this would call get_execution_history on the contract
        // const client = new PaymentSchedulerClient(env, contractId);
        // return await client.getExecutionHistory(scheduleId, limit);

        // For now, return empty array
        return [];
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch execution history';
        setError(errorMessage);
        throw err;
      }
    },
    [publicKey]
  );

  /**
   * Get all schedules for an owner
   */
  const getOwnerSchedules = useCallback(
    async (owner: string): Promise<PaymentSchedule[]> => {
      try {
        // In production, this would call get_owner_schedules on the contract
        // const client = new PaymentSchedulerClient(env, contractId);
        // return await client.getOwnerSchedules(owner);

        // For now, return empty array
        return [];
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch schedules';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  return {
    schedules,
    isLoading,
    error,
    createSchedule,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
    getExecutionHistory,
    getOwnerSchedules,
    refreshSchedules,
  };
};

export default usePaymentScheduler;
