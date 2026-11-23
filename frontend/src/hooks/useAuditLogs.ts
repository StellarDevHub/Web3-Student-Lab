'use client';

import apiClient from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Administrative audit log data hook (FE-048).
 *
 * Loads audit records, then filters (debounced, against a precomputed
 * lowercase index) and multi-column sorts them entirely in memory so a
 * virtualized grid can render 50k+ rows. When the backend endpoint is not
 * available the hook falls back to an explicitly labelled demo dataset.
 */

export interface AuditLogRecord {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: unknown;
  prevHash: string | null;
}

export type AuditLogColumnKey =
  | 'createdAt'
  | 'action'
  | 'userEmail'
  | 'entity'
  | 'entityId'
  | 'ipAddress';

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  key: AuditLogColumnKey;
  direction: SortDirection;
}

export type AuditLogDataSource = 'live' | 'demo';

export interface UseAuditLogsOptions {
  /** API path relative to the configured backend base URL. */
  endpoint?: string;
  /** Size of the generated demo dataset used when the endpoint is unavailable. */
  demoCount?: number;
  /** Search debounce in milliseconds. */
  debounceMs?: number;
}

const DEFAULT_ENDPOINT = '/admin/audit-logs';
const DEFAULT_DEMO_COUNT = 50_000;
const DEFAULT_DEBOUNCE_MS = 150;

// ─── Demo dataset ────────────────────────────────────────────────────────────

const DEMO_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE_COURSE',
  'UPDATE_COURSE',
  'DELETE_COURSE',
  'ISSUE_CERTIFICATE',
  'REVOKE_CERTIFICATE',
  'ENROLL',
  'HSM_SIGN',
  'ROLE_CHANGE',
];
const DEMO_ENTITIES = ['Course', 'Certificate', 'User', 'Enrollment', 'Transaction', 'Session'];
const DEMO_USERS = ['ada', 'grace', 'linus', 'satoshi', 'vitalik', 'barbara', 'ken', 'margaret'];

/** Deterministic PRNG so the demo dataset is stable across renders and reloads. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoAuditLogs(count: number, seed = 1574): AuditLogRecord[] {
  const random = mulberry32(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const now = Date.UTC(2026, 9, 21);
  const records: AuditLogRecord[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const user = pick(DEMO_USERS);
    const action = pick(DEMO_ACTIONS);
    const entity = pick(DEMO_ENTITIES);
    records[i] = {
      id: `log_${(count - i).toString(36).padStart(6, '0')}`,
      createdAt: new Date(now - i * 47_000 - Math.floor(random() * 30_000)).toISOString(),
      userId: `usr_${user}`,
      userEmail: `${user}@student-lab.dev`,
      action,
      entity,
      entityId: `${entity.toLowerCase()}_${Math.floor(random() * 5000)}`,
      ipAddress: `10.${Math.floor(random() * 255)}.${Math.floor(random() * 255)}.${Math.floor(random() * 255)}`,
      userAgent: random() > 0.5 ? 'Mozilla/5.0 (Macintosh)' : 'Mozilla/5.0 (X11; Linux x86_64)',
      details: {
        requestId: `req_${Math.floor(random() * 1e9).toString(16)}`,
        durationMs: Math.floor(random() * 900),
        outcome: random() > 0.08 ? 'success' : 'failure',
        ...(action === 'HSM_SIGN' ? { provider: 'aws-kms', purpose: 'relayer-fee-bump' } : {}),
      },
      prevHash: null,
    };
  }
  return records;
}

// ─── Fetching ────────────────────────────────────────────────────────────────

interface AuditLogsResult {
  logs: AuditLogRecord[];
  dataSource: AuditLogDataSource;
}

function normalizeAuditLogsResponse(data: unknown): AuditLogRecord[] | null {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).logs ?? (data as Record<string, unknown>).entries)
      : null;
  if (!Array.isArray(list)) return null;

  return list.map((raw: Record<string, unknown>, index) => ({
    id: String(raw.id ?? index),
    createdAt: String(raw.createdAt ?? ''),
    userId: (raw.userId as string | null) ?? null,
    userEmail: (raw.userEmail as string | null) ?? null,
    action: String(raw.action ?? ''),
    entity: (raw.entity as string | null) ?? null,
    entityId: (raw.entityId as string | null) ?? null,
    ipAddress: (raw.ipAddress as string | null) ?? null,
    userAgent: (raw.userAgent as string | null) ?? null,
    details: raw.details ?? null,
    prevHash: (raw.prevHash as string | null) ?? null,
  }));
}

async function fetchAuditLogs(endpoint: string, demoCount: number): Promise<AuditLogsResult> {
  try {
    const response = await apiClient.get(endpoint);
    const logs = normalizeAuditLogsResponse(response.data);
    if (logs) return { logs, dataSource: 'live' };
  } catch {
    // Endpoint unavailable (offline, not deployed, or unauthorized) — fall through to demo data.
  }
  return { logs: generateDemoAuditLogs(demoCount), dataSource: 'demo' };
}

// ─── Filtering / sorting ─────────────────────────────────────────────────────

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function compareRecords(a: AuditLogRecord, b: AuditLogRecord, rules: readonly SortRule[]): number {
  for (const rule of rules) {
    const left = a[rule.key] ?? '';
    const right = b[rule.key] ?? '';
    // ISO timestamps, ids, and emails all order correctly as plain strings.
    const result = left < right ? -1 : left > right ? 1 : 0;
    if (result !== 0) return rule.direction === 'asc' ? result : -result;
  }
  return 0;
}

export interface UseAuditLogsResult {
  logs: AuditLogRecord[];
  /** Filtered + sorted rows for the grid. */
  rows: AuditLogRecord[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  dataSource: AuditLogDataSource | null;
  search: string;
  setSearch: (value: string) => void;
  /** True while the input is ahead of the debounced filter. */
  isFiltering: boolean;
  /** Time spent filtering + sorting the last debounced query, in ms. */
  filterDurationMs: number;
  sortRules: SortRule[];
  /** Click toggles asc → desc → off; with `additive` (shift-click) it adds a secondary sort. */
  toggleSort: (key: AuditLogColumnKey, additive?: boolean) => void;
  clearSort: () => void;
  refetch: () => void;
}

export function useAuditLogs({
  endpoint = DEFAULT_ENDPOINT,
  demoCount = DEFAULT_DEMO_COUNT,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseAuditLogsOptions = {}): UseAuditLogsResult {
  const query = useQuery({
    queryKey: ['admin', 'audit-logs', endpoint, demoCount],
    queryFn: () => fetchAuditLogs(endpoint, demoCount),
    staleTime: 60_000,
  });

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), debounceMs);
  const [sortRules, setSortRules] = useState<SortRule[]>([{ key: 'createdAt', direction: 'desc' }]);

  const logs = useMemo(() => query.data?.logs ?? [], [query.data]);

  // One lowercase haystack per row, built once per dataset, so each keystroke is a single
  // `includes` per row instead of re-serializing every field (keeps 50k rows well under 50ms).
  const searchIndex = useMemo(
    () =>
      logs.map((log) =>
        [log.id, log.action, log.userEmail, log.userId, log.entity, log.entityId, log.ipAddress, log.createdAt]
          .join('\u0000')
          .toLowerCase(),
      ),
    [logs],
  );

  const { rows, filterDurationMs } = useMemo(() => {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

    let filtered: AuditLogRecord[];
    if (debouncedSearch) {
      filtered = [];
      for (let i = 0; i < logs.length; i++) {
        if (searchIndex[i]!.includes(debouncedSearch)) filtered.push(logs[i]!);
      }
    } else {
      filtered = logs.slice();
    }

    if (sortRules.length > 0) filtered.sort((a, b) => compareRecords(a, b, sortRules));

    const finished = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { rows: filtered, filterDurationMs: finished - started };
  }, [logs, searchIndex, debouncedSearch, sortRules]);

  const toggleSort = useCallback((key: AuditLogColumnKey, additive = false) => {
    setSortRules((current) => {
      const existing = current.find((rule) => rule.key === key);
      const nextRule: SortRule | null = !existing
        ? { key, direction: 'asc' }
        : existing.direction === 'asc'
          ? { key, direction: 'desc' }
          : null;

      if (!additive) return nextRule ? [nextRule] : [];

      const others = current.filter((rule) => rule.key !== key);
      if (!nextRule) return others;
      return existing
        ? current.map((rule) => (rule.key === key ? nextRule : rule))
        : [...others, nextRule];
    });
  }, []);

  const clearSort = useCallback(() => setSortRules([]), []);
  const { refetch } = query;

  return {
    logs,
    rows,
    totalCount: logs.length,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    dataSource: query.data?.dataSource ?? null,
    search,
    setSearch,
    isFiltering: search.trim().toLowerCase() !== debouncedSearch,
    filterDurationMs,
    sortRules,
    toggleSort,
    clearSort,
    refetch: () => void refetch(),
  };
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export interface CsvColumn {
  key: keyof AuditLogRecord;
  label: string;
}

export const AUDIT_LOG_CSV_COLUMNS: CsvColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'createdAt', label: 'Timestamp' },
  { key: 'action', label: 'Action' },
  { key: 'userId', label: 'User ID' },
  { key: 'userEmail', label: 'User Email' },
  { key: 'entity', label: 'Entity' },
  { key: 'entityId', label: 'Entity ID' },
  { key: 'ipAddress', label: 'IP Address' },
  { key: 'userAgent', label: 'User Agent' },
  { key: 'details', label: 'Details' },
];

/**
 * RFC 4180 field escaping, plus neutralising spreadsheet formula injection
 * (cells starting with = + - @ tab or CR are prefixed with a quote).
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toAuditLogCsv(rows: readonly AuditLogRecord[], columns: CsvColumn[] = AUDIT_LOG_CSV_COLUMNS): string {
  const lines = [columns.map((column) => escapeCsvField(column.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvField(row[column.key])).join(','));
  }
  return lines.join('\r\n');
}

/** Download the given (already filtered + sorted) rows as a CSV file. */
export function downloadAuditLogCsv(rows: readonly AuditLogRecord[], filename?: string): void {
  const csv = toAuditLogCsv(rows);
  // Leading BOM so Excel detects UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `audit-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
