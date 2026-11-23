'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BuybackDashboardData, calculateBuybackAggregates, fetchBuybackDashboard,
  formatAmount, formatCurrency, formatDate,
} from '@/lib/buyback-data';

type Tab = 'overview' | 'history' | 'supply';

export default function BuybackDashboard() {
  const [data, setData] = useState<BuybackDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBuybackDashboard(signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Could not load buyback data.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading) return <DashboardMessage title="Loading buyback data…" />;
  if (error) return <DashboardMessage title="Buyback data is unavailable" detail={error} action={<RetryButton onClick={() => void load()} />} />;
  if (!data) return null;

  const aggregates = calculateBuybackAggregates(data.records);
  const latestSupply = data.supplyHistory.at(-1);
  const totalBurned = latestSupply?.burned ?? 0;
  const currentSupply = latestSupply?.supply ?? data.initialSupply;
  const reductionPercentage = data.initialSupply === 0 ? 0 : (totalBurned / data.initialSupply) * 100;
  const pieData = [
    { name: 'Current Supply', value: currentSupply },
    { name: 'Burned', value: totalBurned },
  ];
  const hasRecords = data.records.length > 0;

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Token Buyback Program</h1>
          <p className="text-gray-400">On-chain buyback and burn activity, sourced from the program indexer.</p>
        </header>

        <div className="mb-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm border border-gray-600 bg-gray-900">
          <span className={`h-2 w-2 rounded-full ${data.config.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={data.config.enabled ? 'text-green-400' : 'text-red-400'}>{data.config.enabled ? 'Active' : 'Inactive'}</span>
          <button className="ml-3 text-blue-400 hover:underline" onClick={() => void load()}>Refresh</button>
        </div>

        <nav className="mb-8 flex gap-4 border-b border-gray-700" aria-label="Buyback dashboard sections">
          {(['overview', 'history', 'supply'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-2 pb-4 font-semibold capitalize ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-300'}`}>
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Spent" value={formatCurrency(aggregates.totalSpent)} subtext="All indexed purchases" />
            <MetricCard label="Tokens Purchased" value={formatAmount(aggregates.totalTokensBought)} subtext="All indexed buybacks" />
            <MetricCard label="Average Price" value={formatCurrency(aggregates.averagePrice)} subtext="Weighted by tokens purchased" />
            <MetricCard label="Treasury Balance" value={formatCurrency(data.treasuryBalance)} subtext="Available for buyback" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Configuration"><ConfigRow label="Revenue Allocation" value={`${formatAmount(data.config.revenuePercentage)}%`} /><ConfigRow label="Buyback Frequency" value={formatFrequency(data.config.frequency)} /><ConfigRow label="Min Buyback Amount" value={formatCurrency(data.config.minBuybackAmount)} /><ConfigRow label="Max Buyback Amount" value={formatCurrency(data.config.maxBuybackAmount)} /><ConfigRow label="Total Buybacks" value={String(aggregates.buybackCount)} /></Panel>
            <Panel title="Statistics"><ConfigRow label="Total Amount Spent" value={formatCurrency(aggregates.totalSpent)} /><ConfigRow label="Tokens Purchased" value={formatAmount(aggregates.totalTokensBought)} /><ConfigRow label="Tokens Burned" value={formatAmount(totalBurned)} /><ConfigRow label="Last Buyback" value={aggregates.lastBuybackTime ? formatDate(aggregates.lastBuybackTime) : 'No buybacks yet'} /></Panel>
          </div>
          <ChartPanel title="Price Trend" empty={!hasRecords} emptyText="No indexed buybacks yet. Price data will appear after the first execution.">
            <LineChart data={data.records}><ChartGrid /><XAxis dataKey="timestamp" tickFormatter={shortDate} stroke="#888" /><YAxis stroke="#888" /><ChartTooltip /><Legend /><Line type="monotone" dataKey="pricePerToken" stroke="#3b82f6" name="Price per Token" /></LineChart>
          </ChartPanel>
        </div>}

        {activeTab === 'history' && <div className="space-y-6">
          {hasRecords ? <div className="overflow-hidden rounded-lg border border-gray-700/50 bg-gray-900/50"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-gray-700/50 bg-gray-900/70">{['Date', 'Amount Spent', 'Tokens Purchased', 'Price/Token', 'Transaction'].map(header => <th key={header} className="px-6 py-4 text-left text-sm font-semibold text-gray-300">{header}</th>)}</tr></thead><tbody className="divide-y divide-gray-700/50">{data.records.slice().reverse().map(record => <tr key={`${record.transactionId ?? 'buyback'}-${record.timestamp}`} className="hover:bg-gray-800/30"><td className="px-6 py-4 text-sm">{formatDate(record.timestamp)}</td><td className="px-6 py-4 text-sm text-green-400">{formatCurrency(record.purchaseAmount)}</td><td className="px-6 py-4 text-sm">{formatAmount(record.tokensPurchased)}</td><td className="px-6 py-4 text-sm">{formatCurrency(record.pricePerToken)}</td><td className="px-6 py-4 font-mono text-sm">{record.explorerUrl && record.transactionId ? <a href={record.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" aria-label={`View transaction ${record.transactionId} in explorer`}>{shortTransaction(record.transactionId)}</a> : <span className="text-gray-500">Unavailable</span>}</td></tr>)}</tbody></table></div></div> : <EmptyState text="No buybacks have been indexed. The program remains usable while it has no history." />}
          <ChartPanel title="Purchase Distribution" empty={!hasRecords} emptyText="No purchase data is available yet."><BarChart data={data.records}><ChartGrid /><XAxis dataKey="timestamp" tickFormatter={shortDate} stroke="#888" /><YAxis stroke="#888" /><ChartTooltip /><Legend /><Bar dataKey="purchaseAmount" fill="#3b82f6" name="Amount Spent" /><Bar dataKey="tokensPurchased" fill="#10b981" name="Tokens Purchased" /></BarChart></ChartPanel>
        </div>}

        {activeTab === 'supply' && <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3"><MetricCard label="Tokens Burned" value={formatAmount(totalBurned)} subtext="Total burn" /><MetricCard label="Current Supply" value={formatAmount(currentSupply)} subtext="Remaining tokens" /><MetricCard label="Reduction Rate" value={`${formatAmount(reductionPercentage, 3)}%`} subtext="Of initial supply" /></div>
          <ChartPanel title="Supply Reduction Over Time" empty={!data.supplyHistory.length} emptyText="Supply snapshots have not been indexed yet."><LineChart data={data.supplyHistory}><ChartGrid /><XAxis dataKey="timestamp" tickFormatter={shortDate} stroke="#888" /><YAxis yAxisId="left" stroke="#888" /><YAxis yAxisId="right" orientation="right" stroke="#888" /><ChartTooltip /><Legend /><Line yAxisId="left" type="monotone" dataKey="supply" stroke="#3b82f6" name="Token Supply" /><Line yAxisId="right" type="monotone" dataKey="burned" stroke="#ef4444" name="Tokens Burned" /></LineChart></ChartPanel>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Panel title="Supply Distribution"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${formatAmount(Number(value))}`}><Cell fill="#3b82f6" /><Cell fill="#ef4444" /></Pie><ChartTooltip /></PieChart></ResponsiveContainer></div></Panel><Panel title="Burn Details"><ConfigRow label="Initial Supply" value={formatAmount(data.initialSupply)} /><ConfigRow label="Total Burned" value={formatAmount(totalBurned)} /><ConfigRow label="Current Supply" value={formatAmount(currentSupply)} /><ConfigRow label="Burn Percentage" value={`${formatAmount(reductionPercentage, 3)}%`} /><ConfigRow label="Burn Mechanism" value="Automated Buyback" /></Panel></div>
        </div>}
      </div>
    </div>
  );
}

function ChartPanel({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: ReactNode }) { return <Panel title={title}>{empty ? <EmptyState text={emptyText} /> : <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>}</Panel>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6"><h2 className="mb-6 text-xl font-bold">{title}</h2>{children}</section>; }
function MetricCard({ label, value, subtext }: { label: string; value: string; subtext: string }) { return <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-6"><div className="mb-2 text-sm text-gray-400">{label}</div><div className="mb-1 text-2xl font-bold">{value}</div><div className="text-xs text-gray-500">{subtext}</div></div>; }
function ConfigRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-gray-700/30 py-3 last:border-0"><span className="text-sm text-gray-400">{label}</span><span className="font-semibold text-white">{value}</span></div>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded border border-dashed border-gray-700 px-4 py-10 text-center text-sm text-gray-400">{text}</div>; }
function DashboardMessage({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) { return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black p-8 text-center text-white"><p className="text-lg">{title}</p>{detail && <p className="max-w-lg text-sm text-gray-400">{detail}</p>}{action}</div>; }
function RetryButton({ onClick }: { onClick: () => void }) { return <button className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500" onClick={onClick}>Try again</button>; }
function ChartGrid() { return <CartesianGrid strokeDasharray="3 3" stroke="#444" />; }
function ChartTooltip() { return <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px' }} />; }
function shortDate(timestamp: number) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp); }
function shortTransaction(transactionId: string) { return transactionId.length > 14 ? `${transactionId.slice(0, 10)}…${transactionId.slice(-4)}` : transactionId; }
function formatFrequency(seconds: number) { if (seconds === 0) return 'Not scheduled'; if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`; if (seconds % 3600 === 0) return `${seconds / 3600} hours`; return `${formatAmount(seconds)} seconds`; }
