'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface BuybackRecord {
  timestamp: number;
  purchaseAmount: number;
  tokensPurchased: number;
  pricePerToken: number;
  transactionId: string;
}

interface BuybackStats {
  totalSpent: number;
  totalTokensBought: number;
  buybackCount: number;
  treasuryBalance: number;
  averagePrice: number;
  lastBuybackTime: number;
}

interface BuybackConfig {
  revenuePercentage: number;
  frequency: number;
  minBuybackAmount: number;
  maxBuybackAmount: number;
  enabled: boolean;
}

interface BuybackSupplyData {
  timestamp: number;
  supply: number;
  burned: number;
  reductionPercentage: number;
}

export default function BuybackDashboard() {
  const [buybackRecords, setBuybackRecords] = useState<BuybackRecord[]>([]);
  const [buybackStats, setBuybackStats] = useState<BuybackStats>({
    totalSpent: 0,
    totalTokensBought: 0,
    buybackCount: 0,
    treasuryBalance: 0,
    averagePrice: 0,
    lastBuybackTime: 0,
  });
  const [buybackConfig, setBuybackConfig] = useState<BuybackConfig>({
    revenuePercentage: 0,
    frequency: 0,
    minBuybackAmount: 0,
    maxBuybackAmount: 0,
    enabled: false,
  });
  const [supplyData, setSupplyData] = useState<BuybackSupplyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'supply'>('overview');

  useEffect(() => {
    const fetchBuybackData = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API calls to fetch buyback data
        // For now, we'll use mock data for demonstration

        // Mock buyback records
        const mockRecords: BuybackRecord[] = [
          {
            timestamp: Date.now() - 86400000,
            purchaseAmount: 50000,
            tokensPurchased: 1000,
            pricePerToken: 50,
            transactionId: '0x1a2b3c4d5e6f7g8h9i0j',
          },
          {
            timestamp: Date.now() - 172800000,
            purchaseAmount: 45000,
            tokensPurchased: 1050,
            pricePerToken: 42.86,
            transactionId: '0x2b3c4d5e6f7g8h9i0j1k',
          },
          {
            timestamp: Date.now() - 259200000,
            purchaseAmount: 55000,
            tokensPurchased: 950,
            pricePerToken: 57.89,
            transactionId: '0x3c4d5e6f7g8h9i0j1k2l',
          },
        ];

        const totalSpent = mockRecords.reduce((sum, r) => sum + r.purchaseAmount, 0);
        const totalTokensBought = mockRecords.reduce((sum, r) => sum + r.tokensPurchased, 0);

        setBuybackRecords(mockRecords);
        setBuybackStats({
          totalSpent,
          totalTokensBought,
          buybackCount: mockRecords.length,
          treasuryBalance: 150000,
          averagePrice: totalSpent / totalTokensBought,
          lastBuybackTime: mockRecords[0].timestamp,
        });

        setBuybackConfig({
          revenuePercentage: 15,
          frequency: 86400,
          minBuybackAmount: 10000,
          maxBuybackAmount: 100000,
          enabled: true,
        });

        // Mock supply reduction data
        const mockSupplyData: BuybackSupplyData[] = [
          {
            timestamp: Date.now() - 259200000,
            supply: 10000000,
            burned: 0,
            reductionPercentage: 0,
          },
          {
            timestamp: Date.now() - 172800000,
            supply: 9998950,
            burned: 1050,
            reductionPercentage: 0.01,
          },
          {
            timestamp: Date.now() - 86400000,
            supply: 9997950,
            burned: 2050,
            reductionPercentage: 0.02,
          },
          {
            timestamp: Date.now(),
            supply: 9997000,
            burned: 3000,
            reductionPercentage: 0.03,
          },
        ];

        setSupplyData(mockSupplyData);
      } catch (error) {
        console.error('Failed to fetch buyback data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBuybackData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-lg text-white">Loading Buyback Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Token Buyback Program</h1>
          <p className="text-gray-400">
            Automated token buyback and burn mechanism for deflationary tokenomics
          </p>
        </div>

        {/* Status Badge */}
        <div className="mb-6">
          <div
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 ${
              buybackConfig.enabled
                ? 'border border-green-500/30 bg-green-900/30 text-green-400'
                : 'border border-red-500/30 bg-red-900/30 text-red-400'
            }`}
          >
            <div
              className={`h-2 w-2 rounded-full ${
                buybackConfig.enabled ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span>{buybackConfig.enabled ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 flex gap-4 border-b border-gray-700">
          {['overview', 'history', 'supply'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-2 pb-4 font-semibold transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Spent"
                value={`$${buybackStats.totalSpent.toLocaleString()}`}
                subtext="Purchase amount"
              />
              <MetricCard
                label="Tokens Purchased"
                value={buybackStats.totalTokensBought.toLocaleString()}
                subtext="Total buyback"
              />
              <MetricCard
                label="Average Price"
                value={`$${buybackStats.averagePrice.toFixed(2)}`}
                subtext="Per token"
              />
              <MetricCard
                label="Treasury Balance"
                value={`$${buybackStats.treasuryBalance.toLocaleString()}`}
                subtext="Available for buyback"
              />
            </div>

            {/* Configuration & Statistics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Configuration */}
              <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
                <h2 className="mb-6 text-xl font-bold">Configuration</h2>
                <div className="space-y-4">
                  <ConfigRow
                    label="Revenue Allocation"
                    value={`${buybackConfig.revenuePercentage}%`}
                  />
                  <ConfigRow
                    label="Buyback Frequency"
                    value={`${(buybackConfig.frequency / 3600).toFixed(0)} hours`}
                  />
                  <ConfigRow
                    label="Min Buyback Amount"
                    value={`$${buybackConfig.minBuybackAmount.toLocaleString()}`}
                  />
                  <ConfigRow
                    label="Max Buyback Amount"
                    value={`$${buybackConfig.maxBuybackAmount.toLocaleString()}`}
                  />
                  <ConfigRow label="Total Buybacks" value={buybackStats.buybackCount.toString()} />
                </div>
              </div>

              {/* Statistics */}
              <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
                <h2 className="mb-6 text-xl font-bold">Statistics</h2>
                <div className="space-y-4">
                  <StatRow
                    label="Total Amount Spent"
                    value={`$${buybackStats.totalSpent.toLocaleString()}`}
                    trend={+12.5}
                  />
                  <StatRow
                    label="Tokens in Circulation"
                    value={buybackStats.totalTokensBought.toLocaleString()}
                    trend={-3.2}
                  />
                  <StatRow label="Program Uptime" value="97.8%" trend={+0.5} />
                  <StatRow
                    label="Last Buyback"
                    value={formatRelativeTime(buybackStats.lastBuybackTime)}
                    trend={undefined}
                  />
                </div>
              </div>
            </div>

            {/* Price Trend Chart */}
            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
              <h2 className="mb-6 text-xl font-bold">Price Trend</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={buybackRecords}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                    stroke="#888"
                  />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="pricePerToken"
                    stroke="#3b82f6"
                    dot={{ fill: '#3b82f6' }}
                    name="Price per Token"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-lg border border-gray-700/50 bg-gray-900/50">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700/50 bg-gray-900/70">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                        Amount Spent
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                        Tokens Purchased
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                        Price/Token
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                        Transaction
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {buybackRecords.map((record, index) => (
                      <tr key={index} className="transition-colors hover:bg-gray-800/30">
                        <td className="px-6 py-4 text-sm">
                          {new Date(record.timestamp).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-green-400">
                          ${record.purchaseAmount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {record.tokensPurchased.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm">${record.pricePerToken.toFixed(2)}</td>
                        <td className="px-6 py-4 font-mono text-sm text-blue-400">
                          <a
                            href={`https://stellar.expert/explorer/transactions/${record.transactionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {record.transactionId.slice(0, 10)}...
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Distribution Chart */}
            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
              <h2 className="mb-6 text-xl font-bold">Purchase Distribution</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={buybackRecords}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                    stroke="#888"
                  />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="purchaseAmount" fill="#3b82f6" name="Amount Spent" />
                  <Bar dataKey="tokensPurchased" fill="#10b981" name="Tokens Purchased" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Supply Tab */}
        {activeTab === 'supply' && (
          <div className="space-y-6">
            {/* Supply Reduction Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <MetricCard
                label="Tokens Burned"
                value={supplyData[supplyData.length - 1]?.burned.toLocaleString() || '0'}
                subtext="Total burn"
              />
              <MetricCard
                label="Current Supply"
                value={supplyData[supplyData.length - 1]?.supply.toLocaleString() || '0'}
                subtext="Remaining tokens"
              />
              <MetricCard
                label="Reduction Rate"
                value={`${(supplyData[supplyData.length - 1]?.reductionPercentage || 0).toFixed(
                  3
                )}%`}
                subtext="Total burned"
              />
            </div>

            {/* Supply Trend Chart */}
            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
              <h2 className="mb-6 text-xl font-bold">Supply Reduction Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={supplyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                    stroke="#888"
                  />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="supply"
                    stroke="#3b82f6"
                    name="Token Supply"
                    yAxisId="left"
                  />
                  <Line
                    type="monotone"
                    dataKey="burned"
                    stroke="#ef4444"
                    name="Tokens Burned"
                    yAxisId="right"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Burn Pie Chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
                <h2 className="mb-6 text-xl font-bold">Supply Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: 'Current Supply',
                          value: supplyData[supplyData.length - 1]?.supply || 0,
                        },
                        {
                          name: 'Burned',
                          value: supplyData[supplyData.length - 1]?.burned || 0,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #444',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Burn Details */}
              <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6">
                <h2 className="mb-6 text-xl font-bold">Burn Details</h2>
                <div className="space-y-4">
                  <DetailRow label="Initial Supply" value="10,000,000" />
                  <DetailRow
                    label="Total Burned"
                    value={supplyData[supplyData.length - 1]?.burned.toLocaleString() || '0'}
                  />
                  <DetailRow
                    label="Current Supply"
                    value={supplyData[supplyData.length - 1]?.supply.toLocaleString() || '0'}
                  />
                  <DetailRow
                    label="Burn Percentage"
                    value={`${(supplyData[supplyData.length - 1]?.reductionPercentage || 0).toFixed(
                      3
                    )}%`}
                  />
                  <DetailRow label="Burn Mechanism" value="Automated Buyback" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
}

function MetricCard({ label, value, subtext }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6 transition-colors hover:border-gray-600/50">
      <div className="mb-2 text-sm text-gray-400">{label}</div>
      <div className="mb-1 text-2xl font-bold text-white">{value}</div>
      {subtext && <div className="text-xs text-gray-500">{subtext}</div>}
    </div>
  );
}

interface ConfigRowProps {
  label: string;
  value: string;
}

function ConfigRow({ label, value }: ConfigRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700/30 py-3 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  trend?: number;
}

function StatRow({ label, value, trend }: StatRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700/30 py-3 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">{value}</span>
        {trend !== undefined && (
          <span className={trend >= 0 ? 'text-sm text-green-400' : 'text-sm text-red-400'}>
            {trend >= 0 ? '+' : ''}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700/30 py-3 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
