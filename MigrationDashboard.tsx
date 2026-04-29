"use client";

import { useEffect, useState } from 'react';

// --- Mocks & Placeholders ---
// Replace these with your actual Soroban contract interaction library
const sorobanUtils = {
  getOldTokenBalance: async (userAddress: string) => "1000.0000000",
  getAllowance: async (userAddress: string, spender: string) => "0.0000000",
  getMigrationDeadline: async () => Date.now() / 1000 + 86400 * 7, // 7 days from now
  getTotalMigrated: async () => "500000.0000000",
  approve: async (spender: string, amount: string) => {
    console.log(`Approving ${spender} for ${amount}`);
    await new Promise(res => setTimeout(res, 2000));
    return true;
  },
  migrate: async (amount: string) => {
    console.log(`Migrating ${amount}`);
    await new Promise(res => setTimeout(res, 2000));
    return true;
  },
};

const MIGRATION_CONTRACT_ID = "CD...YOUR_MIGRATION_CONTRACT_ID";
const USER_ADDRESS = "GD...YOUR_USER_ADDRESS"; // This would come from a wallet connection

const Countdown = ({ deadline }: { deadline: number }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      const remaining = deadline - now;

      if (remaining <= 0) {
        setTimeLeft("Migration period has ended.");
        clearInterval(interval);
        return;
      }

      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = Math.floor(remaining % 60);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  return <div className="text-xl font-mono text-yellow-400">{timeLeft}</div>;
};

export default function MigrationDashboard() {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Data from blockchain
  const [oldTokenBalance, setOldTokenBalance] = useState("0");
  const [allowance, setAllowance] = useState("0");
  const [deadline, setDeadline] = useState(0);
  const [totalMigrated, setTotalMigrated] = useState("0");

  const needsApproval = parseFloat(allowance) < parseFloat(amount || "0");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balance, allowance, deadline, totalMigrated] = await Promise.all([
          sorobanUtils.getOldTokenBalance(USER_ADDRESS),
          sorobanUtils.getAllowance(USER_ADDRESS, MIGRATION_CONTRACT_ID),
          sorobanUtils.getMigrationDeadline(),
          sorobanUtils.getTotalMigrated(),
        ]);
        setOldTokenBalance(balance);
        setAllowance(allowance);
        setDeadline(deadline);
        setTotalMigrated(totalMigrated);
      } catch (error) {
        console.error("Failed to fetch migration data:", error);
        setStatus("Error: Could not load migration data.");
      }
    };
    fetchData();
  }, []);

  const handleApprove = async () => {
    setIsLoading(true);
    setStatus(`Approving migration contract to spend ${amount} legacy tokens...`);
    try {
      await sorobanUtils.approve(MIGRATION_CONTRACT_ID, amount);
      setAllowance(amount); // Optimistically update allowance
      setStatus("Approval successful! You can now migrate.");
    } catch (error) {
      console.error(error);
      setStatus("Error: Approval failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigrate = async () => {
    setIsLoading(true);
    setStatus(`Migrating ${amount} legacy tokens...`);
    try {
      await sorobanUtils.migrate(amount);
      setStatus("Migration successful! Your new tokens have been minted.");
      // Refetch data after migration
      const newBalance = await sorobanUtils.getOldTokenBalance(USER_ADDRESS);
      setOldTokenBalance(newBalance);
      setAmount('');
    } catch (error) {
      console.error(error);
      setStatus("Error: Migration failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-gray-800 text-white rounded-lg shadow-lg border border-gray-700">
      <h1 className="text-3xl font-bold mb-4 text-center">Token Migration Tool</h1>
      <p className="text-gray-400 mb-6 text-center">
        Seamlessly swap your legacy RST tokens for the new, upgraded version.
      </p>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-center">
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-sm text-gray-400">Time Remaining</h3>
          {deadline > 0 ? <Countdown deadline={deadline} /> : <div className="text-xl font-mono">Loading...</div>}
        </div>
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-sm text-gray-400">Total Tokens Migrated</h3>
          <div className="text-xl font-mono">{parseFloat(totalMigrated).toLocaleString()}</div>
        </div>
      </div>

      {/* Swap Interface */}
      <div className="space-y-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">
            Amount to Migrate
          </label>
          <div className="relative">
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isLoading}
            />
            <button
              onClick={() => setAmount(oldTokenBalance)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
            >
              Max
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Your Balance: {parseFloat(oldTokenBalance).toLocaleString()} Legacy RST</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isLoading || !amount || parseFloat(amount) <= 0}
              className="w-full p-3 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Approving..." : "1. Approve"}
            </button>
          ) : (
            <div className="w-full p-3 text-center bg-green-800 border border-green-600 rounded-md">✓ Approved</div>
          )}

          <button
            onClick={handleMigrate}
            disabled={isLoading || needsApproval || !amount || parseFloat(amount) <= 0}
            className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Migrating..." : "2. Migrate"}
          </button>
        </div>
      </div>

      {/* Status Message */}
      {status && (
        <div className="mt-6 p-3 text-center bg-gray-700 border border-gray-600 rounded-md">
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}
