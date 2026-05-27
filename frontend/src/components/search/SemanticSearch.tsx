'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Calendar,
  DollarSign,
  Clock,
  Save,
  Bell,
  X,
  ChevronDown,
  Tag,
} from 'lucide-react';
import { useGlobal } from '@/stores';

// Types for ledger transactions
interface LedgerTransaction {
  id: string;
  type: 'payment' | 'transfer' | 'swap' | 'stake' | 'reward' | 'fee';
  amount: number;
  asset: string;
  from: string;
  to: string;
  timestamp: Date;
  description: string;
  hash: string;
  memo?: string;
  status: 'pending' | 'completed' | 'failed';
  blockNumber?: number;
  fee?: number;
}

interface SearchFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  amountRange: {
    min: number | null;
    max: number | null;
  };
  assets: string[];
  types: string[];
  status: string[];
}

interface SearchResult {
  transaction: LedgerTransaction;
  score: number;
  highlights: string[];
  matchedIntent: string;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  createdAt: Date;
  alertsEnabled: boolean;
}

// Mock data for demonstration
const mockTransactions: LedgerTransaction[] = [
  {
    id: '1',
    type: 'payment',
    amount: 100,
    asset: 'XLM',
    from: 'GABC...123',
    to: 'GDEF...456',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    description: 'Payment to Bob for lunch',
    hash: '0xabc123...',
    memo: 'Lunch money',
    status: 'completed',
    blockNumber: 12345,
    fee: 0.0001,
  },
  {
    id: '2',
    type: 'transfer',
    amount: 500,
    asset: 'USDC',
    from: 'GHI...789',
    to: 'GJKL...012',
    timestamp: new Date('2024-01-14T15:45:00Z'),
    description: 'Transfer to savings account',
    hash: '0xdef456...',
    status: 'completed',
    blockNumber: 12344,
    fee: 0.0002,
  },
  {
    id: '3',
    type: 'swap',
    amount: 0.5,
    asset: 'ETH',
    from: 'GMNO...345',
    to: 'GPQR...678',
    timestamp: new Date('2024-01-13T09:15:00Z'),
    description: 'Swapped ETH for XLM',
    hash: '0xghi789...',
    status: 'completed',
    blockNumber: 12343,
    fee: 0.001,
  },
  // Add more mock transactions...
];

// Intent patterns for semantic understanding
const intentPatterns = {
  payments: [
    /payment|paid|pay|sent|transfer|gave|lunch|dinner|coffee|food/i,
    /money|cash|fund|bill|check/i,
  ],
  transfers: [/transfer|move|send|deposit|withdraw/i, /account|wallet|savings|exchange/i],
  swaps: [/swap|exchange|trade|convert|change/i, /for|to|into/i],
  rewards: [/reward|staking|interest|earn|claim/i, /bonus|airdrop|dividend/i],
  fees: [/fee|cost|charge|commission|gas/i, /expense|transaction cost/i],
  recent: [
    /recent|latest|new|today|yesterday|this week|last week/i,
    /just now|a few minutes ago|an hour ago/i,
  ],
  large: [/large|big|huge|significant|substantial/i, /thousand|hundred|million/i],
  small: [/small|tiny|little|minor|micro/i, /cent|penny|few dollars/i],
};

// Semantic search engine
class SemanticSearchEngine {
  private transactions: LedgerTransaction[];
  private embeddings: Map<string, number[]> = new Map();

  constructor(transactions: LedgerTransaction[]) {
    this.transactions = transactions;
    this.generateEmbeddings();
  }

  private generateEmbeddings(): void {
    this.transactions.forEach((tx) => {
      const text = this.createSearchableText(tx);
      const embedding = this.createSimpleEmbedding(text);
      this.embeddings.set(tx.id, embedding);
    });
  }

  private createSearchableText(tx: LedgerTransaction): string {
    return [
      tx.description,
      tx.memo || '',
      tx.type,
      tx.asset,
      tx.amount.toString(),
      tx.from,
      tx.to,
      tx.status,
      new Date(tx.timestamp).toLocaleDateString(),
    ]
      .join(' ')
      .toLowerCase();
  }

  private createSimpleEmbedding(text: string): number[] {
    // Simple keyword-based embedding (in production, use actual ML embeddings)
    const keywords = text.split(/\s+/);
    const embedding = new Array(100).fill(0);

    keywords.forEach((keyword, index) => {
      const hash = this.simpleHash(keyword);
      embedding[hash % 100] += 1;
    });

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private detectIntent(query: string): string[] {
    const detectedIntents: string[] = [];

    Object.entries(intentPatterns).forEach(([intent, patterns]) => {
      if (patterns.some((pattern) => pattern.test(query))) {
        detectedIntents.push(intent);
      }
    });

    return detectedIntents;
  }

  private calculateSimilarity(queryEmbedding: number[], docEmbedding: number[]): number {
    // Simple cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < queryEmbedding.length; i++) {
      dotProduct += queryEmbedding[i] * docEmbedding[i];
      normA += queryEmbedding[i] * queryEmbedding[i];
      normB += docEmbedding[i] * docEmbedding[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  search(query: string, filters: Partial<SearchFilters> = {}): SearchResult[] {
    const queryEmbedding = this.createSimpleEmbedding(query.toLowerCase());
    const detectedIntents = this.detectIntent(query);

    const results: SearchResult[] = [];

    this.transactions.forEach((tx) => {
      // Apply filters first
      if (!this.passesFilters(tx, filters)) return;

      const embedding = this.embeddings.get(tx.id);
      if (!embedding) return;

      const similarity = this.calculateSimilarity(queryEmbedding, embedding);

      if (similarity > 0.1) {
        // Threshold for relevance
        const highlights = this.extractHighlights(tx, query);

        results.push({
          transaction: tx,
          score: similarity,
          highlights,
          matchedIntent: detectedIntents.join(', ') || 'general',
        });
      }
    });

    // Sort by relevance score
    return results.sort((a, b) => b.score - a.score);
  }

  private passesFilters(tx: LedgerTransaction, filters: Partial<SearchFilters>): boolean {
    if (filters.dateRange?.start && tx.timestamp < filters.dateRange.start) return false;
    if (filters.dateRange?.end && tx.timestamp > filters.dateRange.end) return false;
    if (filters.amountRange?.min && tx.amount < filters.amountRange.min) return false;
    if (filters.amountRange?.max && tx.amount > filters.amountRange.max) return false;
    if (filters.assets?.length && !filters.assets.includes(tx.asset)) return false;
    if (filters.types?.length && !filters.types.includes(tx.type)) return false;
    if (filters.status?.length && !filters.status.includes(tx.status)) return false;

    return true;
  }

  private extractHighlights(tx: LedgerTransaction, query: string): string[] {
    const highlights: string[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    const searchableText = this.createSearchableText(tx);

    queryWords.forEach((word) => {
      if (searchableText.includes(word)) {
        highlights.push(word);
      }
    });

    return [...new Set(highlights)]; // Remove duplicates
  }
}

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [searchName, setSearchName] = useState('');

  const [filters, setFilters] = useState<SearchFilters>({
    dateRange: { start: null, end: null },
    amountRange: { min: null, max: null },
    assets: [],
    types: [],
    status: [],
  });

  const { features } = useGlobal();

  const searchEngine = useMemo(() => {
    return new SemanticSearchEngine(mockTransactions);
  }, []);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);

      try {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 300));

        const searchResults = searchEngine.search(searchQuery, filters);
        setResults(searchResults);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    },
    [searchEngine, filters]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  const handleSaveSearch = () => {
    if (!searchName.trim() || !query.trim()) return;

    const newSavedSearch: SavedSearch = {
      id: `search_${Date.now()}`,
      name: searchName,
      query,
      filters: { ...filters },
      createdAt: new Date(),
      alertsEnabled: false,
    };

    setSavedSearches((prev) => [...prev, newSavedSearch]);
    setSearchName('');
    setShowSaveDialog(false);
  };

  const handleLoadSavedSearch = (savedSearch: SavedSearch) => {
    setQuery(savedSearch.query);
    setFilters(savedSearch.filters);
  };

  const handleDeleteSavedSearch = (id: string) => {
    setSavedSearches((prev) => prev.filter((search) => search.id !== id));
  };

  const toggleAlert = (id: string) => {
    setSavedSearches((prev) =>
      prev.map((search) =>
        search.id === id ? { ...search, alertsEnabled: !search.alertsEnabled } : search
      )
    );
  };

  const clearFilters = () => {
    setFilters({
      dateRange: { start: null, end: null },
      amountRange: { min: null, max: null },
      assets: [],
      types: [],
      status: [],
    });
  };

  if (!features.semanticSearch) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-yellow-800">
            Semantic search is not enabled. Enable it in settings to use this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Search Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Semantic Transaction Search</h1>
        <p className="mb-6 text-gray-600">
          Search your ledger activity using natural language. Try "find my last payment to Bob" or
          "large transfers this month".
        </p>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions in natural language..."
            className="w-full rounded-lg border border-gray-300 py-3 pr-12 pl-10 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 transform text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Search Actions */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 rounded-lg bg-gray-100 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-200"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              <ChevronDown
                className={`h-4 w-4 transform transition-transform ${showFilters ? 'rotate-180' : ''}`}
              />
            </button>

            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={!query.trim()}
              className="flex items-center space-x-2 rounded-lg bg-blue-100 px-3 py-2 text-blue-700 transition-colors hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>Save Search</span>
            </button>
          </div>

          <div className="text-sm text-gray-500">
            {isSearching ? 'Searching...' : `${results.length} results found`}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Search Filters</h3>
              <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Date Range */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  <Calendar className="mr-1 inline h-4 w-4" />
                  Date Range
                </label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={filters.dateRange.start?.toISOString().split('T')[0] || ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        dateRange: {
                          ...prev.dateRange,
                          start: e.target.value ? new Date(e.target.value) : null,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={filters.dateRange.end?.toISOString().split('T')[0] || ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        dateRange: {
                          ...prev.dateRange,
                          end: e.target.value ? new Date(e.target.value) : null,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Amount Range */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  <DollarSign className="mr-1 inline h-4 w-4" />
                  Amount Range
                </label>
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Min amount"
                    value={filters.amountRange.min || ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        amountRange: {
                          ...prev.amountRange,
                          min: e.target.value ? parseFloat(e.target.value) : null,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max amount"
                    value={filters.amountRange.max || ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        amountRange: {
                          ...prev.amountRange,
                          max: e.target.value ? parseFloat(e.target.value) : null,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Transaction Types */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  <Tag className="mr-1 inline h-4 w-4" />
                  Transaction Types
                </label>
                <div className="space-y-1">
                  {['payment', 'transfer', 'swap', 'stake', 'reward', 'fee'].map((type) => (
                    <label key={type} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.types.includes(type)}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            types: e.target.checked
                              ? [...prev.types, type]
                              : prev.types.filter((t) => t !== type),
                          }))
                        }
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Search Results</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {results.map((result, index) => (
              <motion.div
                key={result.transaction.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-6 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center space-x-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          result.transaction.type === 'payment'
                            ? 'bg-green-100 text-green-800'
                            : result.transaction.type === 'transfer'
                              ? 'bg-blue-100 text-blue-800'
                              : result.transaction.type === 'swap'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {result.transaction.type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          result.transaction.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : result.transaction.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {result.transaction.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        Relevance: {(result.score * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-gray-500">Intent: {result.matchedIntent}</span>
                    </div>

                    <h3 className="mb-1 font-medium text-gray-900">
                      {result.transaction.description}
                    </h3>

                    <div className="space-y-1 text-sm text-gray-600">
                      <div>
                        Amount:{' '}
                        <span className="font-medium">
                          {result.transaction.amount} {result.transaction.asset}
                        </span>
                      </div>
                      <div>
                        From: <span className="font-mono text-xs">{result.transaction.from}</span>
                      </div>
                      <div>
                        To: <span className="font-mono text-xs">{result.transaction.to}</span>
                      </div>
                      <div>
                        Date:{' '}
                        <span className="font-medium">
                          {result.transaction.timestamp.toLocaleDateString()}
                        </span>
                      </div>
                      {result.transaction.memo && (
                        <div>
                          Memo: <span className="font-medium">{result.transaction.memo}</span>
                        </div>
                      )}
                    </div>

                    {result.highlights.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs text-gray-500">Matched terms: </span>
                        {result.highlights.map((highlight, i) => (
                          <span
                            key={i}
                            className="mr-1 inline-block rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800"
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <button className="text-sm font-medium text-blue-600 hover:text-blue-800">
                      View Details
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Saved Searches</h3>
          <div className="space-y-3">
            {savedSearches.map((savedSearch) => (
              <div
                key={savedSearch.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
              >
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{savedSearch.name}</h4>
                  <p className="text-sm text-gray-600">{savedSearch.query}</p>
                  <p className="text-xs text-gray-500">
                    Created {savedSearch.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleAlert(savedSearch.id)}
                    className={`rounded-lg p-2 transition-colors ${
                      savedSearch.alertsEnabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                    title={savedSearch.alertsEnabled ? 'Disable alerts' : 'Enable alerts'}
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleLoadSavedSearch(savedSearch)}
                    className="rounded-lg bg-blue-100 px-3 py-1 text-blue-700 transition-colors hover:bg-blue-200"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteSavedSearch(savedSearch.id)}
                    className="rounded-lg bg-red-100 px-3 py-1 text-red-700 transition-colors hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Search Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Save Search</h3>
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Search name..."
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2"
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSearch}
                  disabled={!searchName.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
