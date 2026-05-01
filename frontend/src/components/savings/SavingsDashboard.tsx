"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SavingsAccount {
  owner: string;
  balance: bigint;
  lockPeriod: bigint;
  createdAt: bigint;
  maturityDate: bigint;
  interestRate: number;
  lastInterestClaim: bigint;
  totalInterestEarned: bigint;
}

interface SavingsDashboardProps {
  walletAddress?: string;
}

export default function SavingsDashboard({ walletAddress }: SavingsDashboardProps) {
  const [account, setAccount] = useState<SavingsAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingInterest, setPendingInterest] = useState<bigint>(BigInt(0));
  const [amount, setAmount] = useState("");
  const [lockPeriod, setLockPeriod] = useState("30");
  const [interestRate, setInterestRate] = useState("500");
  const [isCreating, setIsCreating] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    loadAccount();
    const interval = setInterval(updatePendingInterest, 10000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const loadAccount = async () => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load savings account:", error);
      setIsLoading(false);
    }
  };

  const updatePendingInterest = async () => {
    if (!account) return;

    try {
      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const timeElapsed = currentTime - account.lastInterestClaim;
      const interest = calculateInterest(account.balance, account.interestRate, timeElapsed);
      setPendingInterest(interest);
    } catch (error) {
      console.error("Failed to update pending interest:", error);
    }
  };

  const calculateInterest = (principal: bigint, annualRate: number, timeSeconds: bigint): bigint => {
    if (principal <= BigInt(0) || annualRate === 0 || timeSeconds <= BigInt(0)) {
      return BigInt(0);
    }

    const SECONDS_PER_YEAR = BigInt(31536000);
    const BASIS_POINTS = BigInt(10000);

    const ratePerSecond = (BigInt(annualRate) * principal) / SECONDS_PER_YEAR;
    const interest = (ratePerSecond * timeSeconds) / BASIS_POINTS;

    return interest;
  };

  const handleCreateSavings = async () => {
    if (!walletAddress || !amount || parseFloat(amount) <= 0) return;

    setIsCreating(true);
    try {
      const lockPeriodSeconds = BigInt(parseInt(lockPeriod) * 86400);
      const amountStroops = BigInt(Math.floor(parseFloat(amount) * 10000000));

      console.log("Creating savings account:", {
        amount: amountStroops,
        lockPeriod: lockPeriodSeconds,
        interestRate: parseInt(interestRate),
      });

      setAmount("");
      await loadAccount();
    } catch (error) {
      console.error("Failed to create savings:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleWithdraw = async (isEarly: boolean) => {
    if (!account || !withdrawAmount || parseFloat(withdrawAmount) <= 0) return;

    setIsWithdrawing(true);
    try {
      const withdrawAmountStroops = BigInt(Math.floor(parseFloat(withdrawAmount) * 10000000));

      console.log(`${isEarly ? "Early" : "Matured"} withdrawal:`, withdrawAmountStroops);

      setWithdrawAmount("");
      await loadAccount();
    } catch (error) {
      console.error("Failed to withdraw:", error);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleClaimInterest = async () => {
    if (!account) return;

    try {
      console.log("Claiming interest");
      await loadAccount();
    } catch (error) {
      console.error("Failed to claim interest:", error);
    }
  };

  const formatAmount = (amount: bigint): string => {
    return (Number(amount) / 10000000).toFixed(7);
  };

  const formatDate = (timestamp: bigint): string => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString();
  };

  const isMatured = account ? BigInt(Math.floor(Date.now() / 1000)) >= account.maturityDate : false;
  const daysUntilMaturity = account
    ? Math.max(0, Math.floor(Number(account.maturityDate - BigInt(Math.floor(Date.now() / 1000))) / 86400))
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Connect your wallet to access savings features</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Time-Locked Savings</h2>
      </div>

      {!account ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-md p-6"
        >
          <h3 className="text-xl font-semibold mb-4">Create Savings Account</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (XLM)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                step="0.0000001"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lock Period (Days)
              </label>
              <select
                value={lockPeriod}
                onChange={(e) => setLockPeriod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="1">1 Day</option>
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="180">180 Days</option>
                <option value="365">365 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Interest Rate (APY %)
              </label>
              <input
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="5.00"
                step="0.01"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                {(parseInt(interestRate) / 100).toFixed(2)}% APY
              </p>
            </div>

            <button
              onClick={handleCreateSavings}
              disabled={isCreating || !amount || parseFloat(amount) <= 0}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? "Creating..." : "Create Savings Account"}
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 text-white"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Your Savings</h3>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isMatured ? "bg-green-500" : "bg-yellow-500"
              }`}>
                {isMatured ? "Matured" : `${daysUntilMaturity} days left`}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-blue-100 text-sm">Balance</p>
                <p className="text-3xl font-bold">{formatAmount(account.balance)} XLM</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Interest Rate</p>
                  <p className="text-lg font-semibold">{(account.interestRate / 100).toFixed(2)}% APY</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Total Earned</p>
                  <p className="text-lg font-semibold">{formatAmount(account.totalInterestEarned)} XLM</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Created</p>
                  <p className="text-sm font-medium">{formatDate(account.createdAt)}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Maturity Date</p>
                  <p className="text-sm font-medium">{formatDate(account.maturityDate)}</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <h3 className="text-xl font-semibold mb-4">Interest Tracker</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Pending Interest</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatAmount(pendingInterest)} XLM
                  </p>
                </div>
                <button
                  onClick={handleClaimInterest}
                  disabled={pendingInterest <= BigInt(0)}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Claim
                </button>
              </div>

              <div className="text-sm text-gray-600">
                <p>Last claimed: {formatDate(account.lastInterestClaim)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <h3 className="text-xl font-semibold mb-4">Withdrawal</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (XLM)
                </label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  step="0.0000001"
                  min="0"
                  max={formatAmount(account.balance)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleWithdraw(false)}
                  disabled={isWithdrawing || !isMatured || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isWithdrawing ? "Processing..." : "Withdraw"}
                </button>

                <button
                  onClick={() => handleWithdraw(true)}
                  disabled={isWithdrawing || isMatured || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Early Withdraw
                </button>
              </div>

              {!isMatured && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-800">
                    <span className="font-semibold">Early Withdrawal Penalty:</span> 10% penalty applies for withdrawals before maturity date
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
