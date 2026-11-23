'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Wallet,
  Zap,
  Activity,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { MerkleTree, Recipient } from '../../utils/merkle';
import recipientsData from './recipients.json';
import { useAuth } from '@/contexts/AuthContext';

const recipients = recipientsData as Recipient[];

export const AirdropDashboard: React.FC = () => {
  const { user } = useAuth();
  const [merkleTree, setMerkleTree] = useState<MerkleTree | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'eligible' | 'not-eligible' | 'claiming' | 'success' | 'error'
  >('idle');
  const [eligibilityData, setEligibilityData] = useState<{
    amount: string;
    proof: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Stats for the dashboard
  const totalRecipients = recipients.length;
  const totalAmount = recipients.reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0));
  const poolSize = '1,000,000 RST';

  useEffect(() => {
    const initMerkle = async () => {
      const tree = await MerkleTree.create(recipients);
      setMerkleTree(tree);
      console.log('Merkle Root:', tree.getRoot());
    };
    initMerkle();
  }, []);

  const checkEligibility = async () => {
    if (!user?.email) return; // Assuming email stores the wallet address for now

    setStatus('checking');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const recipient = recipients.find((r) => r.address === user.email);

    if (recipient && merkleTree) {
      const proof = await merkleTree.getProofAsync(recipient.address, recipient.amount);
      setEligibilityData({ amount: recipient.amount, proof });
      setStatus('eligible');
    } else {
      setStatus('not-eligible');
    }
  };

  const handleClaim = async () => {
    if (!eligibilityData) return;

    setStatus('claiming');

    try {
      // Simulate Soroban contract call
      console.log('Calling airdrop_manager::claim', {
        user: user?.email,
        amount: eligibilityData.amount,
        proof: eligibilityData.proof,
      });

      await new Promise((resolve) => setTimeout(resolve, 2500));
      setStatus('success');
    } catch (err) {
      setErrorMsg('Transaction failed on Stellar network.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black p-8 text-white selection:bg-red-600 selection:text-white">
      {/* Header Section */}
      <div className="mx-auto mb-12 flex max-w-6xl flex-col items-end justify-between gap-6 md:flex-row">
        <div className="border-l-4 border-red-600 py-2 pl-6">
          <h1 className="mb-2 text-4xl font-black tracking-tight uppercase md:text-5xl">
            Protocol <span className="text-red-600">Airdrop</span>
          </h1>
          <p className="text-sm font-light tracking-widest text-gray-400 uppercase">
            Merkle-Based Distribution · Anti-Sybil Shield Active
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-6 py-3">
            <Clock className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase">Deadline</p>
              <p className="font-mono text-sm font-bold">24D 14H 05M</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-6 py-3">
            <Activity className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase">Network</p>
              <p className="font-mono text-sm font-bold">STELLAR_TEST</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Claim Panel */}
        <div className="space-y-8 lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-10"
          >
            <div className="absolute top-0 right-0 -mt-32 -mr-32 h-64 w-64 rounded-full bg-red-600/5 blur-[80px]"></div>

            <div className="relative z-10">
              <h2 className="mb-8 flex items-center gap-3 text-2xl font-black tracking-widest uppercase">
                <Gift className="h-7 w-7 text-red-600" />
                Claim Dashboard
              </h2>

              <AnimatePresence mode="wait">
                {status === 'idle' && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-12 text-center"
                  >
                    <p className="mx-auto mb-8 max-w-md text-gray-400">
                      Initialize the cryptographic verification sequence to check your eligibility
                      for the token distribution.
                    </p>
                    <button
                      onClick={checkEligibility}
                      className="group relative rounded-xl bg-red-600 px-10 py-5 font-black tracking-widest uppercase shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all hover:bg-red-700"
                    >
                      Check Eligibility
                      <ArrowRight className="ml-3 inline-block h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </button>
                  </motion.div>
                )}

                {status === 'checking' && (
                  <motion.div
                    key="checking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-12 text-center"
                  >
                    <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-red-600 border-t-transparent"></div>
                    <p className="animate-pulse font-mono text-sm font-bold tracking-tighter text-red-500 uppercase">
                      Traversing Merkle Tree...
                    </p>
                  </motion.div>
                )}

                {status === 'eligible' && (
                  <motion.div
                    key="eligible"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="mb-8 flex items-center gap-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-8">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-wide text-white uppercase">
                          Eligibility Confirmed
                        </h3>
                        <p className="font-mono text-sm text-green-500/80">
                          Cryptographic proof generated for your address.
                        </p>
                      </div>
                    </div>

                    <div className="mb-8 grid grid-cols-2 gap-6">
                      <div className="rounded-xl border border-white/5 bg-black p-6">
                        <p className="mb-2 text-xs font-bold text-gray-500 uppercase">
                          Claimable Amount
                        </p>
                        <p className="text-3xl font-black text-white">
                          {Number(eligibilityData?.amount) / 10 ** 7} RST
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-black p-6">
                        <p className="mb-2 text-xs font-bold text-gray-500 uppercase">Proof Size</p>
                        <p className="text-3xl font-black text-white">
                          {eligibilityData?.proof.length} Nodes
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleClaim}
                      className="w-full rounded-xl bg-white py-5 font-black tracking-widest text-black uppercase transition-all hover:bg-gray-200"
                    >
                      Execute Claim Transaction
                    </button>
                  </motion.div>
                )}

                {status === 'not-eligible' && (
                  <motion.div
                    key="not-eligible"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-12 text-center"
                  >
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-600/20 bg-red-600/10">
                      <AlertTriangle className="h-8 w-8 text-red-600" />
                    </div>
                    <h3 className="mb-2 text-xl font-black tracking-wide text-white uppercase">
                      Not Eligible
                    </h3>
                    <p className="mx-auto mb-8 max-w-sm font-light text-gray-500">
                      Your address was not found in the distribution list. Please verify your
                      identity or check other nodes.
                    </p>
                    <button
                      onClick={() => setStatus('idle')}
                      className="rounded-lg border border-white/20 px-8 py-3 text-xs font-bold tracking-widest uppercase transition-all hover:border-white"
                    >
                      Return to Start
                    </button>
                  </motion.div>
                )}

                {status === 'claiming' && (
                  <motion.div key="claiming" className="py-12 text-center">
                    <div className="relative mx-auto mb-8 h-20 w-20">
                      <div className="absolute inset-0 rounded-full border-4 border-red-600/20"></div>
                      <div className="absolute inset-0 animate-spin rounded-full border-4 border-red-600 border-t-transparent"></div>
                      <Zap className="absolute inset-0 m-auto h-8 w-8 animate-pulse text-red-600" />
                    </div>
                    <p className="mb-2 text-lg font-black tracking-widest text-white uppercase">
                      Executing On-Chain
                    </p>
                    <p className="font-mono text-xs text-gray-500">
                      Waiting for Stellar Consensus...
                    </p>
                  </motion.div>
                )}

                {status === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 text-center"
                  >
                    <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-green-500/40 bg-green-500/20 shadow-[0_0_40px_rgba(34,197,94,0.3)]">
                      <CheckCircle2 className="h-12 w-12 text-green-500" />
                    </div>
                    <h3 className="mb-2 text-3xl font-black tracking-tighter text-white uppercase">
                      Tokens Secured
                    </h3>
                    <p className="mx-auto mb-10 max-w-md text-gray-400">
                      The airdrop tokens have been successfully transferred to your wallet.
                    </p>
                    <div className="flex justify-center gap-4">
                      <button className="rounded-lg border border-white/10 bg-zinc-900 px-6 py-3 text-xs font-bold tracking-widest uppercase transition-all hover:border-white">
                        View Transaction
                      </button>
                      <button className="rounded-lg bg-red-600 px-6 py-3 text-xs font-bold tracking-widest uppercase transition-all">
                        Go to Dashboard
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Verification Status */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-zinc-950 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10">
                <UserCheck className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h4 className="mb-1 text-sm font-bold tracking-wide text-white uppercase">
                  Identity Verified
                </h4>
                <p className="text-xs font-light text-gray-500">Status: PASSED</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-zinc-950 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
                <ShieldCheck className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h4 className="mb-1 text-sm font-bold tracking-wide text-white uppercase">
                  Sybil Protection
                </h4>
                <p className="text-xs font-light text-gray-500">Shield: ACTIVE</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Stats */}
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-8">
            <h3 className="mb-6 border-b border-white/5 pb-4 text-lg font-black tracking-widest uppercase">
              Distribution Metrics
            </h3>
            <div className="space-y-6">
              <div>
                <p className="mb-1 text-[10px] font-black text-gray-500 uppercase">
                  Total Pool Size
                </p>
                <p className="text-2xl font-black text-white">{poolSize}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-black text-gray-500 uppercase">
                  Eligible Addresses
                </p>
                <p className="text-2xl font-black text-white">{totalRecipients}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-black text-gray-500 uppercase">Claimed Ratio</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                  <div className="h-full w-1/3 bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
                </div>
                <p className="mt-1 text-right font-mono text-[10px] text-gray-500">
                  33.3% COMPLETE
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-8">
            <h3 className="mb-6 flex items-center gap-2 border-b border-white/5 pb-4 text-lg font-black tracking-widest uppercase">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              Sybil Protection
            </h3>
            <p className="mb-6 text-xs leading-relaxed font-light text-gray-400">
              Our heuristic engine monitors for automated patterns and duplicate identities.
              Detected sybil accounts are automatically blacklisted from this and future airdrops.
            </p>
            <div className="rounded-xl border border-red-600/20 bg-red-600/5 p-4">
              <p className="mb-1 text-[10px] font-black text-red-500 uppercase">Detected Sybils</p>
              <p className="font-mono text-xl font-black text-white">142</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
