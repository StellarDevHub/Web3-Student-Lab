'use client';

import { useState, useEffect, useMemo } from 'react';
import { vestingAPI, type VestingSchedule } from '@/lib/api';

interface VestingDashboardProps {
  projectId: string;
  projectTitle: string;
}

export default function VestingDashboard({ projectId, projectTitle }: VestingDashboardProps) {
  // Config form state
  const [tokenName, setTokenName] = useState('Community Token');
  const [tokenSymbol, setTokenSymbol] = useState('COMM');
  const [amount, setAmount] = useState(100000);
  const [cliffMonths, setCliffMonths] = useState(6);
  const [durationMonths, setDurationMonths] = useState(24);
  const [beneficiary, setBeneficiary] = useState('GB2P4X7B2UXK6D5J4LNVO37GLV2WMVMOUVM2ATCSJJRZ74UCE7IPJLAO');

  // App state
  const [schedule, setSchedule] = useState<VestingSchedule | null>(null);
  const [simulatedMonths, setSimulatedMonths] = useState(0);
  const [claimAmountInput, setClaimAmountInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch vesting schedule for the project on load
  useEffect(() => {
    let active = true;
    async function loadSchedule() {
      setLoading(true);
      setError(null);
      try {
        const data = await vestingAPI.getByProjectId(projectId);
        if (active) {
          setSchedule(data);
          // Set simulated months to max duration to show final state or current state
          setSimulatedMonths(0);
        }
      } catch (err: any) {
        // 404 is fine, means no schedule exists yet
        if (err.response?.status !== 404 && active) {
          setError('Failed to load vesting schedule.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSchedule();
    return () => {
      active = false;
    };
  }, [projectId]);

  // Handle Deploy
  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await vestingAPI.create({
        projectId,
        tokenName,
        tokenSymbol,
        amount,
        cliffMonths,
        durationMonths,
        beneficiary,
      });
      setSchedule(data);
      setSuccess('Vesting schedule deployed successfully on-chain (simulated)!');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to deploy vesting schedule.');
    } finally {
      setLoading(false);
    }
  };

  // Calculations for simulated time
  const simulationData = useMemo(() => {
    if (!schedule) return null;

    let vested = 0;
    if (simulatedMonths >= schedule.durationMonths) {
      vested = schedule.amount;
    } else if (simulatedMonths < schedule.cliffMonths) {
      vested = 0;
    } else {
      vested = schedule.amount * (simulatedMonths / schedule.durationMonths);
    }

    const claimable = Math.max(0, vested - schedule.claimedAmount);
    const locked = Math.max(0, schedule.amount - vested);

    return {
      vested,
      claimable,
      locked,
    };
  }, [schedule, simulatedMonths]);

  // Handle Claim
  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule || !simulationData) return;

    const claimVal = parseFloat(claimAmountInput);
    if (isNaN(claimVal) || claimVal <= 0) {
      setError('Please enter a valid amount to claim.');
      return;
    }

    if (claimVal > simulationData.claimable) {
      setError(`Cannot claim more than the currently claimable amount of ${simulationData.claimable.toFixed(2)}.`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await vestingAPI.claim(projectId, claimVal, simulatedMonths);
      setSchedule(updated);
      setClaimAmountInput('');
      setSuccess(`Successfully claimed ${claimVal.toLocaleString()} ${schedule.tokenSymbol}!`);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to claim tokens.');
    } finally {
      setLoading(false);
    }
  };

  // Preset configuration autofills for students
  const applyPreset = (preset: 'standard' | 'founder' | 'advisor') => {
    if (preset === 'standard') {
      setCliffMonths(6);
      setDurationMonths(24);
    } else if (preset === 'founder') {
      setCliffMonths(12);
      setDurationMonths(36);
    } else if (preset === 'advisor') {
      setCliffMonths(0);
      setDurationMonths(12);
    }
  };

  // Generate SVG path coordinates for the vesting curve chart
  const chartPath = useMemo(() => {
    if (!schedule) return '';
    const width = 500;
    const height = 150;
    const padding = 10;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    const totalDuration = schedule.durationMonths;
    const cliff = schedule.cliffMonths;

    // x coordinates
    const startX = padding;
    const cliffX = padding + (cliff / totalDuration) * graphWidth;
    const endX = padding + graphWidth;

    // y coordinates (0 is top, height is bottom)
    const bottomY = height - padding;
    const topY = padding;

    // Path
    // Start at (startX, bottomY)
    // Horizontal line to (cliffX, bottomY)
    // Diagonal to (endX, topY)
    return `M ${startX} ${bottomY} L ${cliffX} ${bottomY} L ${endX} ${topY}`;
  }, [schedule]);

  // Current simulated dot on SVG
  const simulatedDot = useMemo(() => {
    if (!schedule) return null;
    const width = 500;
    const height = 150;
    const padding = 10;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    const totalDuration = schedule.durationMonths;
    const cliff = schedule.cliffMonths;

    const x = padding + (Math.min(simulatedMonths, totalDuration) / totalDuration) * graphWidth;
    
    let y = height - padding;
    if (simulatedMonths >= totalDuration) {
      y = padding;
    } else if (simulatedMonths >= cliff) {
      const ratio = simulatedMonths / totalDuration;
      y = height - padding - ratio * graphHeight;
    }

    return { x, y };
  }, [schedule, simulatedMonths]);

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-black uppercase tracking-wider text-red-500">Token Vesting Gateway</h3>
          <p className="text-xs text-zinc-400">Configure, simulate, and claim tokens for {projectTitle}</p>
        </div>
        {schedule && (
          <span className="rounded-full bg-green-500/10 px-3 py-1 text-[10px] font-black tracking-widest text-green-400 uppercase border border-green-500/20">
            Active Contract
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-400">
          {success}
        </div>
      )}

      {!schedule ? (
        /* Configuration Form */
        <form onSubmit={handleDeploy} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tokenName" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Token Name</label>
              <input
                id="tokenName"
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500 text-white"
              />
            </div>
            <div>
              <label htmlFor="tokenSymbol" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Symbol</label>
              <input
                id="tokenSymbol"
                type="text"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="amount" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Total Amount</label>
              <input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="1"
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500 text-white"
              />
            </div>
            <div>
              <label htmlFor="cliffMonths" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Cliff (Months)</label>
              <input
                id="cliffMonths"
                type="number"
                value={cliffMonths}
                onChange={(e) => setCliffMonths(Number(e.target.value))}
                min="0"
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500 text-white"
              />
            </div>
            <div>
              <label htmlFor="durationMonths" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Duration (Months)</label>
              <input
                id="durationMonths"
                type="number"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
                min="1"
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500 text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="beneficiary" className="mb-1 block text-xs font-bold text-zinc-400 uppercase">Beneficiary Stellar Address</label>
            <input
              id="beneficiary"
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-red-500 text-white font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-xs text-zinc-500 self-center uppercase font-bold mr-2">Quick Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('standard')}
              className="rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] uppercase font-bold tracking-wider px-3 py-1 text-zinc-300"
            >
              Standard (6m cliff, 24m vest)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('founder')}
              className="rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] uppercase font-bold tracking-wider px-3 py-1 text-zinc-300"
            >
              Founder (12m cliff, 36m vest)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('advisor')}
              className="rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] uppercase font-bold tracking-wider px-3 py-1 text-zinc-300"
            >
              Advisor (0cliff, 12m vest)
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase tracking-[0.2em] py-3.5 mt-4 transition-colors"
          >
            {loading ? 'Deploying...' : 'Deploy Vesting Schedule'}
          </button>
        </form>
      ) : (
        /* Vesting Dashboard and Simulator */
        <div className="space-y-6">
          {/* Info Card Grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Total Allocation</span>
              <span className="text-sm font-black text-white">{schedule.amount.toLocaleString()} {schedule.tokenSymbol}</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Cliff Period</span>
              <span className="text-sm font-black text-white">{schedule.cliffMonths} Months</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Total Duration</span>
              <span className="text-sm font-black text-white">{schedule.durationMonths} Months</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Claimed Already</span>
              <span className="text-sm font-black text-red-500">{schedule.claimedAmount.toLocaleString()} {schedule.tokenSymbol}</span>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase">Vesting Progression Curve</span>
              <span className="text-[10px] text-zinc-500 font-mono">X-axis: Months | Y-axis: Unlocked %</span>
            </div>
            <div className="relative">
              <svg viewBox="0 0 500 150" className="w-full overflow-visible">
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid line - Cliff boundary */}
                {schedule.cliffMonths > 0 && (
                  <line
                    x1={10 + (schedule.cliffMonths / schedule.durationMonths) * 480}
                    y1={10}
                    x2={10 + (schedule.cliffMonths / schedule.durationMonths) * 480}
                    y2={140}
                    stroke="#27272a"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Curve path */}
                <path
                  d={chartPath}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                />

                {/* Fill Area */}
                <path
                  d={`${chartPath} L 490 140 L 10 140 Z`}
                  fill="url(#gradient)"
                />

                {/* Dots representing Cliff and End */}
                <circle cx={10 + (schedule.cliffMonths / schedule.durationMonths) * 480} cy={140} r="4" fill="#ef4444" />
                <circle cx={490} cy={10} r="4" fill="#ef4444" />

                {/* Simulated Time Position indicator */}
                {simulatedDot && (
                  <>
                    <line
                      x1={simulatedDot.x}
                      y1={10}
                      x2={simulatedDot.x}
                      y2={140}
                      stroke="#ef4444"
                      strokeWidth="1"
                      strokeOpacity="0.5"
                    />
                    <circle cx={simulatedDot.x} cy={simulatedDot.y} r="6" fill="#fff" stroke="#ef4444" strokeWidth="2" className="animate-pulse" />
                  </>
                )}
              </svg>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-zinc-500 font-mono uppercase">
              <span>0m</span>
              {schedule.cliffMonths > 0 && <span>Cliff: {schedule.cliffMonths}m</span>}
              <span>Vested: {schedule.durationMonths}m</span>
            </div>
          </div>

          {/* Time Simulator Scrub Control */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="time-slider" className="text-xs font-bold text-zinc-400 uppercase">Timeline Simulation Scrubber</label>
              <span className="rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-black text-red-400 font-mono">
                Month {simulatedMonths}
              </span>
            </div>
            <input
              id="time-slider"
              type="range"
              min="0"
              max={schedule.durationMonths + 12}
              value={simulatedMonths}
              onChange={(e) => setSimulatedMonths(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
            />
            
            {/* Realtime Simulation Math */}
            {simulationData && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-900 text-center">
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block mb-0.5">Vested</span>
                  <span className="text-xs font-bold text-white">{simulationData.vested.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block mb-0.5">Remaining Locked</span>
                  <span className="text-xs font-bold text-zinc-400">{simulationData.locked.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block mb-0.5">Claimable Now</span>
                  <span className="text-xs font-black text-green-400">{simulationData.claimable.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Claim Execution Form */}
          {simulationData && (
            <form onSubmit={handleClaim} className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="claim-amount" className="text-xs font-bold text-zinc-400 uppercase">Simulate Claim Request</label>
                <span className="text-[10px] text-zinc-500 font-mono">Limit: {simulationData.claimable.toLocaleString()} {schedule.tokenSymbol}</span>
              </div>
              <div className="flex gap-2">
                <input
                  id="claim-amount"
                  type="number"
                  placeholder="Amount to claim..."
                  value={claimAmountInput}
                  onChange={(e) => setClaimAmountInput(e.target.value)}
                  max={simulationData.claimable}
                  step="any"
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-red-500 text-white font-mono"
                />
                <button
                  type="submit"
                  disabled={loading || simulationData.claimable <= 0 || !claimAmountInput}
                  className="rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 transition-colors"
                >
                  {loading ? 'Claiming...' : 'Claim Tokens'}
                </button>
              </div>
            </form>
          )}

          {/* Beneficiary Info footer */}
          <div className="rounded-lg border border-zinc-900 bg-zinc-950/50 p-3 text-[10px] text-zinc-500 space-y-1 font-mono break-all">
            <div><span className="font-bold text-zinc-400 uppercase">Beneficiary:</span> {schedule.beneficiary}</div>
            <div><span className="font-bold text-zinc-400 uppercase">Contract Address:</span> GVESTINGCONTRACTSIMULATED{schedule.id.slice(-8).toUpperCase()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
