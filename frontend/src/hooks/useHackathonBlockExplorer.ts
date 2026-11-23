'use client';

import { useMemo, useState } from 'react';
import { useBlockchainExplorer } from '@/hooks/useBlockchainExplorer';
import {
  DEFAULT_EXPLORER_FILTER,
  filterExplorerTransactions,
  mergeExplorerStats,
  suggestHackathonIdeasFromActivity,
  type ExplorerFilter,
} from '@/lib/idea-generator/blockExplorer';

export function useHackathonBlockExplorer() {
  const [filter, setFilter] = useState<ExplorerFilter>(DEFAULT_EXPLORER_FILTER);
  const explorer = useBlockchainExplorer({ maxTransactions: 50 });

  const filteredTransactions = useMemo(
    () => filterExplorerTransactions(explorer.transactions, filter),
    [explorer.transactions, filter]
  );

  const filteredStats = useMemo(
    () => mergeExplorerStats(filteredTransactions),
    [filteredTransactions]
  );

  const suggestedIdeas = useMemo(
    () => suggestHackathonIdeasFromActivity(explorer.transactions.slice(0, 20)),
    [explorer.transactions]
  );

  return {
    ...explorer,
    filter,
    setFilter,
    filteredTransactions,
    filteredStats,
    suggestedIdeas,
  };
}
