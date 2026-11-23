'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Filter,
  Gavel,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Warranty, WarrantyStatus } from '../types';

interface StatusBadgeFilterProps {
  selectedStatus: WarrantyStatus;
  onStatusChange: (status: WarrantyStatus) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  warranties: Warranty[];
  className?: string;
}

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  badgeClass: string;
}

export const STATUS_CONFIGS: Record<WarrantyStatus, StatusConfig> = {
  ALL: {
    label: 'All Warranties',
    icon: <Filter className="h-3.5 w-3.5" />,
    activeClass: 'bg-primary text-primary-foreground border-primary shadow-sm',
    badgeClass: 'bg-muted text-foreground',
  },
  ACTIVE: {
    label: 'Active Coverage',
    icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  CLAIM_SUBMITTED: {
    label: 'Claim Submitted',
    icon: <AlertCircle className="h-3.5 w-3.5 text-amber-500" />,
    activeClass: 'bg-amber-600 text-white border-amber-600 shadow-sm',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  IN_ARBITRATION: {
    label: 'In Arbitration',
    icon: <Gavel className="h-3.5 w-3.5 text-purple-500" />,
    activeClass: 'bg-purple-600 text-white border-purple-600 shadow-sm',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
  },
  CLAIM_APPROVED: {
    label: 'Claim Approved',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" />,
    activeClass: 'bg-sky-600 text-white border-sky-600 shadow-sm',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  },
  CLAIM_REJECTED: {
    label: 'Claim Rejected',
    icon: <XCircle className="h-3.5 w-3.5 text-rose-500" />,
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-sm',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  },
  TRANSFERRED: {
    label: 'Transferred',
    icon: <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-500" />,
    activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-sm',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
  },
  EXPIRED: {
    label: 'Expired',
    icon: <Clock className="h-3.5 w-3.5 text-slate-400" />,
    activeClass: 'bg-slate-600 text-white border-slate-600 shadow-sm',
    badgeClass: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  },
};

export const StatusBadgeFilter: React.FC<StatusBadgeFilterProps> = ({
  selectedStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
  warranties,
  className = '',
}) => {
  // Compute counts dynamically
  const counts = React.useMemo(() => {
    const map: Record<WarrantyStatus, number> = {
      ALL: warranties.length,
      ACTIVE: 0,
      CLAIM_SUBMITTED: 0,
      IN_ARBITRATION: 0,
      CLAIM_APPROVED: 0,
      CLAIM_REJECTED: 0,
      TRANSFERRED: 0,
      EXPIRED: 0,
    };

    warranties.forEach((w) => {
      if (w.status in map) {
        map[w.status]++;
      }
    });

    return map;
  }, [warranties]);

  const hasActiveFilters = selectedStatus !== 'ALL' || searchQuery.trim().length > 0;

  const handleClear = () => {
    onStatusChange('ALL');
    onSearchChange('');
  };

  const statuses: WarrantyStatus[] = [
    'ALL',
    'ACTIVE',
    'IN_ARBITRATION',
    'CLAIM_APPROVED',
    'TRANSFERRED',
    'CLAIM_SUBMITTED',
    'CLAIM_REJECTED',
    'EXPIRED',
  ];

  return (
    <div
      data-testid="status-badge-filter"
      className={`space-y-4 bg-card/60 p-4 rounded-xl border border-border ${className}`}
    >
      {/* Top row: search bar & reset button */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by product, serial number (e.g. ZQN-2025), SKU, or owner..."
            className="pl-9 text-sm w-full bg-background"
            data-testid="warranty-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-end sm:self-auto"
            data-testid="clear-filters-btn"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </Button>
        )}
      </div>

      {/* Filter Badges Pill row */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin scrollbar-thumb-muted"
        role="group"
        aria-label="Filter warranties by lifecycle status"
      >
        {statuses.map((statusKey) => {
          const config = STATUS_CONFIGS[statusKey];
          const isSelected = selectedStatus === statusKey;
          const count = counts[statusKey] || 0;

          return (
            <button
              key={statusKey}
              onClick={() => onStatusChange(statusKey)}
              data-testid={`filter-badge-${statusKey.toLowerCase()}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap cursor-pointer select-none ${
                isSelected
                  ? config.activeClass
                  : 'bg-background/80 hover:bg-muted/80 text-foreground border-border/80'
              }`}
              aria-pressed={isSelected}
            >
              <span className="flex items-center gap-1.5">
                {config.icon}
                <span>{config.label}</span>
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StatusBadgeFilter;
