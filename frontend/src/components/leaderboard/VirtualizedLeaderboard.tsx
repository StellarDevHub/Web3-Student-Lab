'use client';

import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export interface LeaderboardColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Classes shared by the header and body cells (width, alignment, responsive visibility). */
  className?: string;
  headerClassName?: string;
}

interface VirtualizedLeaderboardProps<T> {
  rows: T[];
  columns: LeaderboardColumn<T>[];
  getRowKey: (row: T) => string;
  ariaLabel: string;
  estimateRowHeight?: number;
  maxHeight?: number;
  emptyMessage?: string;
  rowClassName?: (row: T, index: number) => string | undefined;
}

/**
 * Fixed-viewport leaderboard that only mounts the rows inside the scroll window
 * (plus overscan), keeping the DOM flat for 10k+ entries.
 *
 * `role="table"` / `row` / `cell` keep the table semantics of the plain markup
 * this replaces, and `aria-rowindex` accounts for the sticky header row.
 */
export default function VirtualizedLeaderboard<T>({
  rows,
  columns,
  getRowKey,
  ariaLabel,
  estimateRowHeight = 56,
  maxHeight = 520,
  emptyMessage = 'No leaderboard entries yet.',
  rowClassName,
}: VirtualizedLeaderboardProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
    getItemKey: (index) => getRowKey(rows[index]),
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10">
        <div className="px-4 py-8 text-center text-sm text-gray-500">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10"
      role="table"
      aria-label={ariaLabel}
      aria-rowcount={rows.length + 1}
    >
      <div role="rowgroup">
        <div
          role="row"
          className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3"
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={cn(
                'text-xs font-semibold tracking-widest text-gray-400 uppercase',
                column.headerClassName
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        data-testid="leaderboard-scroll"
        className="overflow-y-auto overscroll-contain"
        style={{ height: Math.min(maxHeight, rows.length * estimateRowHeight) }}
      >
        <div
          role="rowgroup"
          style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                data-index={virtualRow.index}
                data-testid="leaderboard-row"
                ref={virtualizer.measureElement}
                className={cn(
                  'absolute top-0 left-0 flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-sm',
                  rowClassName?.(row, virtualRow.index)
                )}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {columns.map((column) => (
                  <div key={column.key} role="cell" className={cn('min-w-0', column.className)}>
                    {column.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
