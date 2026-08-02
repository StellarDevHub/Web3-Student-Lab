/**
 * Block Explorer — Hackathon Project Idea Generator pure logic.
 *
 * Filtering, stats, and explorer link helpers for hackathon chain research.
 */

import type { ExplorerTransaction, ExplorerStats } from '@/hooks/useBlockchainExplorer';

export type ExplorerFilter = {
  query: string;
  status: 'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING';
  operation: string;
};

export const DEFAULT_EXPLORER_FILTER: ExplorerFilter = {
  query: '',
  status: 'ALL',
  operation: 'ALL',
};

export const EXPLORER_OPERATIONS = [
  'ALL',
  'PAYMENT',
  'INVOKE_HOST_FUNCTION',
  'CHANGE_TRUST',
  'MANAGE_OFFER',
  'CREATE_ACCOUNT',
] as const;

export function filterExplorerTransactions(
  transactions: ExplorerTransaction[],
  filter: ExplorerFilter
): ExplorerTransaction[] {
  const q = filter.query.trim().toLowerCase();

  return transactions.filter((tx) => {
    if (filter.status !== 'ALL' && tx.status !== filter.status) return false;
    if (filter.operation !== 'ALL' && tx.operation !== filter.operation) return false;
    if (!q) return true;

    return (
      tx.hash.toLowerCase().includes(q) ||
      tx.source.toLowerCase().includes(q) ||
      tx.destination.toLowerCase().includes(q) ||
      tx.operation.toLowerCase().includes(q) ||
      tx.asset.toLowerCase().includes(q)
    );
  });
}

export function mergeExplorerStats(transactions: ExplorerTransaction[]): ExplorerStats {
  if (transactions.length === 0) {
    return { totalTransactions: 0, successRate: 0, averageFee: '0', latestLedger: 0 };
  }
  const succeeded = transactions.filter((t) => t.status === 'SUCCESS').length;
  const totalFee = transactions.reduce((sum, t) => sum + Number(t.fee), 0);
  return {
    totalTransactions: transactions.length,
    successRate: Math.round((succeeded / transactions.length) * 100),
    averageFee: (totalFee / transactions.length).toFixed(0),
    latestLedger: Math.max(...transactions.map((t) => t.ledger)),
  };
}

export function buildStellarExpertLink(hash: string, network: 'testnet' | 'public' = 'testnet'): string {
  const segment = network === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${segment}/tx/${hash}`;
}

export function suggestHackathonIdeasFromActivity(transactions: ExplorerTransaction[]): string[] {
  const ops = new Set(transactions.map((t) => t.operation));
  const ideas: string[] = [];

  if (ops.has('INVOKE_HOST_FUNCTION')) {
    ideas.push('Soroban contract analytics dashboard for hackathon teams');
  }
  if (ops.has('MANAGE_OFFER')) {
    ideas.push('DEX liquidity monitor with real-time offer tracking');
  }
  if (transactions.some((t) => t.status === 'FAILED')) {
    ideas.push('Failed transaction debugger for Stellar testnet submissions');
  }
  if (ideas.length === 0) {
    ideas.push('Lightweight block explorer widget for hackathon demos');
  }
  return ideas;
}
