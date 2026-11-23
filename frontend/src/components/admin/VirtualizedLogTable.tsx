'use client';

import { LogDetailModal } from '@/components/admin/LogDetailModal';
import {
  downloadAuditLogCsv,
  useAuditLogs,
  type AuditLogColumnKey,
  type AuditLogRecord,
  type SortRule,
  type UseAuditLogsOptions,
} from '@/hooks/useAuditLogs';
import { ArrowDown, ArrowUp, Download, RefreshCw, Search, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { List } from 'react-window';

/**
 * High-density administrative audit log grid (FE-048).
 *
 * Only the rows inside the viewport (plus a small overscan) are mounted, so
 * 50,000 records render ~20 row nodes at any time. Supports drag-to-resize
 * columns, multi-column sorting (shift-click), debounced search, a JSON
 * payload inspector, and CSV export of the current filtered + sorted view.
 */

interface ColumnDef {
  key: AuditLogColumnKey;
  label: string;
  defaultWidth: number;
  render?: (log: AuditLogRecord) => React.ReactNode;
}

const ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 72;
const OVERSCAN = 3;

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().replace('T', ' ').slice(0, 19);
};

const COLUMNS: ColumnDef[] = [
  { key: 'createdAt', label: 'Timestamp (UTC)', defaultWidth: 180, render: (log) => formatTimestamp(log.createdAt) },
  { key: 'action', label: 'Action', defaultWidth: 180 },
  { key: 'userEmail', label: 'User', defaultWidth: 220 },
  { key: 'entity', label: 'Entity', defaultWidth: 130 },
  { key: 'entityId', label: 'Entity ID', defaultWidth: 180 },
  { key: 'ipAddress', label: 'IP Address', defaultWidth: 140 },
];

interface LogRowCustomProps {
  rows: AuditLogRecord[];
  gridTemplateColumns: string;
  onOpen: (log: AuditLogRecord) => void;
}

interface LogRowProps extends LogRowCustomProps {
  index: number;
  style: React.CSSProperties;
  ariaAttributes?: React.AriaAttributes & { role?: React.AriaRole };
}

function LogRow({ index, style, rows, gridTemplateColumns, onOpen, ariaAttributes }: LogRowProps) {
  const log = rows[index];
  if (!log) return null;

  return (
    <div
      {...ariaAttributes}
      style={{ ...style, display: 'grid', gridTemplateColumns }}
      tabIndex={0}
      onClick={() => onOpen(log)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(log);
        }
      }}
      className={`cursor-pointer items-center border-b border-white/5 font-mono text-xs text-zinc-300 outline-none hover:bg-white/[0.04] focus-visible:bg-red-500/10 ${
        index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'
      }`}
    >
      {COLUMNS.map((column) => (
        <div key={column.key} className="truncate px-3" title={String(log[column.key] ?? '')}>
          {column.render ? column.render(log) : (log[column.key] ?? <span className="text-zinc-600">—</span>)}
        </div>
      ))}
    </div>
  );
}

function SortIcon({ rule, priority }: { rule?: SortRule; priority: number | null }) {
  if (!rule) return <ArrowDown className="h-3 w-3 opacity-20" />;
  const Icon = rule.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-red-400">
      <Icon className="h-3 w-3" />
      {priority !== null && <sup className="text-[9px]">{priority}</sup>}
    </span>
  );
}

export interface VirtualizedLogTableProps extends UseAuditLogsOptions {
  /** Height of the scrolling body in pixels. */
  height?: number;
}

export function VirtualizedLogTable({ height = 600, ...options }: VirtualizedLogTableProps) {
  const {
    rows,
    totalCount,
    isLoading,
    error,
    dataSource,
    search,
    setSearch,
    isFiltering,
    filterDurationMs,
    sortRules,
    toggleSort,
    clearSort,
    refetch,
  } = useAuditLogs(options);

  const [selected, setSelected] = useState<AuditLogRecord | null>(null);
  const [widths, setWidths] = useState<Record<AuditLogColumnKey, number>>(
    () => Object.fromEntries(COLUMNS.map((column) => [column.key, column.defaultWidth])) as Record<AuditLogColumnKey, number>,
  );

  const gridTemplateColumns = useMemo(
    () => COLUMNS.map((column) => `${widths[column.key]}px`).join(' '),
    [widths],
  );
  const totalWidth = useMemo(() => COLUMNS.reduce((sum, column) => sum + widths[column.key], 0), [widths]);

  const startResize = useCallback((key: AuditLogColumnKey, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = widths[key];
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
      setWidths((current) => (current[key] === next ? current : { ...current, [key]: next }));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, [widths]);

  const handleOpen = useCallback((log: AuditLogRecord) => setSelected(log), []);
  const handleExport = useCallback(() => downloadAuditLogCsv(rows), [rows]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/60" aria-label="Audit logs">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search audit logs</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, user, entity, IP…"
            className="w-full rounded-xl border border-white/10 bg-zinc-900/60 py-2 pr-3 pl-9 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/50 focus:outline-none"
          />
        </label>

        <p className="text-xs text-zinc-500" aria-live="polite">
          {rows.length.toLocaleString()} of {totalCount.toLocaleString()} rows
          {!isLoading && (
            <span className="ml-2 text-zinc-600">
              {isFiltering ? 'filtering…' : `filtered in ${filterDurationMs.toFixed(1)}ms`}
            </span>
          )}
        </p>

        {sortRules.length > 0 && (
          <button
            type="button"
            onClick={clearSort}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5"
          >
            <X className="h-3 w-3" /> Clear sort
          </button>
        )}
        <button
          type="button"
          onClick={refetch}
          aria-label="Reload audit logs"
          className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {dataSource === 'demo' && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          Audit log endpoint unavailable — showing generated demo records.
        </div>
      )}
      {error && <div className="px-4 py-2 text-xs text-red-400">Failed to load audit logs: {error.message}</div>}

      <div className="overflow-x-auto">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          <div
            style={{ display: 'grid', gridTemplateColumns }}
            className="border-b border-white/10 bg-zinc-950 text-[10px] font-black tracking-[0.15em] text-zinc-500 uppercase"
          >
            {COLUMNS.map((column) => {
              const ruleIndex = sortRules.findIndex((rule) => rule.key === column.key);
              const rule = ruleIndex >= 0 ? sortRules[ruleIndex] : undefined;
              const ariaSort = rule ? (rule.direction === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <div key={column.key} className="relative flex items-center" aria-sort={ariaSort} role="columnheader">
                  <button
                    type="button"
                    onClick={(event) => toggleSort(column.key, event.shiftKey)}
                    title="Click to sort, shift-click to add a secondary sort"
                    className="flex w-full items-center gap-1.5 truncate px-3 py-2.5 text-left hover:text-zinc-300"
                  >
                    {column.label}
                    <SortIcon rule={rule} priority={sortRules.length > 1 && rule ? ruleIndex + 1 : null} />
                  </button>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.label} column`}
                    onPointerDown={(event) => startResize(column.key, event)}
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-red-500/50"
                  />
                </div>
              );
            })}
          </div>

          {isLoading ? (
            <div style={{ height }} className="flex items-center justify-center text-xs text-zinc-500">
              Loading audit logs…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ height }} className="flex items-center justify-center text-xs text-zinc-500">
              No audit records match “{search}”.
            </div>
          ) : (
            <List<LogRowCustomProps>
              rowCount={rows.length}
              rowHeight={ROW_HEIGHT}
              overscanCount={OVERSCAN}
              style={{ height, width: '100%' }}
              rowComponent={LogRow}
              rowProps={{ rows, gridTemplateColumns, onOpen: handleOpen }}
            />
          )}
        </div>
      </div>

      <LogDetailModal log={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

export default VirtualizedLogTable;
