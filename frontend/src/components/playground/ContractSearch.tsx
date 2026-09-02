'use client';

import { useState } from 'react';

export type ContractType = 'All' | 'Token' | 'DeFi' | 'Governance' | 'NFT';

export interface Contract {
  id: string;
  name: string;
  type: Exclude<ContractType, 'All'>;
  description: string;
}

export const SAMPLE_CONTRACTS: Contract[] = [
  { id: '1', name: 'SimpleToken', type: 'Token', description: 'Basic fungible token contract' },
  { id: '2', name: 'LiquidityPool', type: 'DeFi', description: 'AMM liquidity pool with swap support' },
  { id: '3', name: 'DAOVoting', type: 'Governance', description: 'On-chain proposal voting system' },
  { id: '4', name: 'WrappedAsset', type: 'Token', description: 'Wrapped cross-chain asset contract' },
  { id: '5', name: 'StellarNFT', type: 'NFT', description: 'Non-fungible token with metadata' },
  { id: '6', name: 'YieldFarm', type: 'DeFi', description: 'Staking rewards distribution contract' },
  { id: '7', name: 'Multisig', type: 'Governance', description: 'Multi-signature approval contract' },
];

const TYPES: ContractType[] = ['All', 'Token', 'DeFi', 'Governance', 'NFT'];

interface ContractSearchProps {
  onSelect: (contract: Contract) => void;
}

export function ContractSearch({ onSelect }: ContractSearchProps) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ContractType>('All');

  const filtered = SAMPLE_CONTRACTS.filter(
    (c) =>
      (type === 'All' || c.type === type) &&
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mb-6 font-mono">
      <p className="mb-3 text-[10px] font-black tracking-widest text-white uppercase">
        Contract Search
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Filter by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search contracts"
          className="flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[11px] text-white placeholder-gray-600 outline-none focus:border-red-500/50"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ContractType)}
          aria-label="Filter by type"
          className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[11px] text-white outline-none focus:border-red-500/50"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-lg border border-white/10">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-[11px] text-gray-600">No contracts found.</li>
        ) : (
          filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c)}
                className="w-full px-3 py-2 text-left text-[11px] hover:bg-white/5 border-b border-white/5 last:border-0"
              >
                <span className="text-white">{c.name}</span>
                <span className="ml-2 text-[9px] text-red-500 uppercase">{c.type}</span>
                <p className="text-gray-500 mt-0.5">{c.description}</p>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
