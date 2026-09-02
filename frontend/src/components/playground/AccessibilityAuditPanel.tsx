'use client';

import type { AuditIssue, AuditResult, AuditSeverity } from '@/lib/editor/SorobanAccessibilityAuditor';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, RefreshCw } from 'lucide-react';
import React, { useId, useState } from 'react';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SeverityBadgeProps {
  severity: AuditSeverity;
  count: number;
}

function SeverityBadge({ severity, count }: SeverityBadgeProps) {
  const styles: Record<AuditSeverity, string> = {
    error: 'bg-red-900/40 text-red-400 border-red-700/40',
    warning: 'bg-amber-900/40 text-amber-400 border-amber-700/40',
    info: 'bg-blue-900/40 text-blue-400 border-blue-700/40',
  };

  const label: Record<AuditSeverity, string> = {
    error: 'ERR',
    warning: 'WARN',
    info: 'INFO',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-black tracking-widest uppercase ${styles[severity]}`}
      aria-label={`${count} ${severity}${count !== 1 ? 's' : ''}`}
    >
      {label[severity]} {count}
    </span>
  );
}

interface IssueRowProps {
  issue: AuditIssue;
  defaultExpanded?: boolean;
}

function IssueRow({ issue, defaultExpanded = false }: IssueRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const detailId = useId();

  const iconMap: Record<AuditSeverity, React.ReactNode> = {
    error: <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" aria-hidden="true" />,
    warning: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" aria-hidden="true" />,
    info: <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" aria-hidden="true" />,
  };

  const severityColor: Record<AuditSeverity, string> = {
    error: 'text-red-400',
    warning: 'text-amber-400',
    info: 'text-blue-400',
  };

  const borderColor: Record<AuditSeverity, string> = {
    error: 'border-red-700/30 hover:border-red-600/50',
    warning: 'border-amber-700/30 hover:border-amber-600/50',
    info: 'border-blue-700/30 hover:border-blue-600/50',
  };

  return (
    <li className={`rounded-lg border bg-zinc-900/50 transition-colors ${borderColor[issue.severity]}`}>
      {/* Issue header — clickable to expand / collapse */}
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        {iconMap[issue.severity]}
        <span className="flex-1 min-w-0">
          <span className={`block text-[11px] font-semibold leading-tight ${severityColor[issue.severity]}`}>
            {issue.message}
          </span>
          <span className="text-[9px] font-medium tracking-widest text-zinc-600 uppercase">
            Line {issue.line}{issue.column ? `:${issue.column}` : ''} · {issue.rule}
          </span>
        </span>
        <span className="flex-shrink-0 ml-1 text-zinc-500" aria-hidden="true">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Expanded suggestion */}
      {expanded && (
        <div
          id={detailId}
          className="border-t border-white/5 px-3 py-2"
          role="region"
          aria-label={`Suggestion for ${issue.rule}`}
        >
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-400">
            <span className="mt-0.5 text-[8px] font-black tracking-widest text-zinc-500 uppercase flex-shrink-0">
              FIX
            </span>
            {issue.suggestion}
          </p>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterTab = AuditSeverity | 'all';

interface FilterTabsProps {
  active: FilterTab;
  counts: AuditResult['counts'];
  total: number;
  onChange: (tab: FilterTab) => void;
}

function FilterTabs({ active, counts, total, onChange }: FilterTabsProps) {
  const tabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: total },
    { id: 'error', label: 'Errors', count: counts.error },
    { id: 'warning', label: 'Warnings', count: counts.warning },
    { id: 'info', label: 'Info', count: counts.info },
  ];

  return (
    <div role="tablist" aria-label="Filter audit issues by severity" className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded px-2 py-1 text-[9px] font-black tracking-widest uppercase transition-colors min-h-[28px] ${
            active === tab.id
              ? 'bg-red-600/20 text-red-400 border border-red-700/40'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1 text-zinc-500">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface AccessibilityAuditPanelProps {
  /** The current audit result; null while not yet computed */
  result: AuditResult | null;
  /** Whether an audit is queued / in-flight */
  isPending: boolean;
  /** Callback to manually trigger a fresh audit */
  onRunAudit?: () => void;
  /** Extra classes for the root element */
  className?: string;
}

export function AccessibilityAuditPanel({
  result,
  isPending,
  onRunAudit,
  className = '',
}: AccessibilityAuditPanelProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const headingId = useId();

  // Reset filter when a new result arrives so we don't show an empty list
  React.useEffect(() => {
    setActiveFilter('all');
  }, [result]);

  const filteredIssues: AuditIssue[] = result
    ? activeFilter === 'all'
      ? result.issues
      : result.issues.filter((i) => i.severity === activeFilter)
    : [];

  const hasErrors = result && result.counts.error > 0;

  return (
    <section
      className={`flex flex-col rounded-3xl border border-white/10 bg-zinc-950 shadow-inner overflow-hidden ${className}`}
      aria-labelledby={headingId}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3
            id={headingId}
            className="text-[10px] font-black tracking-widest text-gray-500 uppercase"
          >
            Accessibility Audit
          </h3>

          {/* Status indicator */}
          {isPending && (
            <span className="text-[9px] font-bold tracking-widest text-zinc-600 uppercase animate-pulse">
              Analyzing…
            </span>
          )}

          {!isPending && result && (
            <>
              {result.passed ? (
                <span className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-emerald-500 uppercase">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Passed
                </span>
              ) : (
                <span
                  className={`text-[9px] font-bold tracking-widest uppercase ${
                    hasErrors ? 'text-red-500' : 'text-amber-500'
                  }`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Severity badges */}
          {result && !result.passed && (
            <div className="flex items-center gap-1" role="status" aria-label="Issue counts by severity">
              {result.counts.error > 0 && (
                <SeverityBadge severity="error" count={result.counts.error} />
              )}
              {result.counts.warning > 0 && (
                <SeverityBadge severity="warning" count={result.counts.warning} />
              )}
              {result.counts.info > 0 && (
                <SeverityBadge severity="info" count={result.counts.info} />
              )}
            </div>
          )}

          {/* Refresh button */}
          {onRunAudit && (
            <button
              type="button"
              onClick={onRunAudit}
              disabled={isPending}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-400 transition hover:border-red-500/40 hover:text-white disabled:opacity-40"
              aria-label="Re-run accessibility audit"
              title="Re-run audit"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Idle / no result yet */}
        {!result && !isPending && (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              Accessibility audit will run automatically as you edit the contract.
            </p>
          </div>
        )}

        {/* Pending */}
        {isPending && !result && (
          <div className="flex flex-1 items-center justify-center p-6" aria-busy="true" aria-live="polite">
            <p className="text-[11px] text-zinc-500 animate-pulse">Auditing contract…</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Passed state */}
            {result.passed ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
                <p className="text-[11px] font-semibold text-emerald-400">All checks passed</p>
                <p className="text-[10px] leading-relaxed text-zinc-600 max-w-xs">
                  No accessibility or interface issues found in this contract.
                </p>
              </div>
            ) : (
              <>
                {/* Filter tabs */}
                <div className="border-b border-white/5 px-3 py-2">
                  <FilterTabs
                    active={activeFilter}
                    counts={result.counts}
                    total={result.issues.length}
                    onChange={setActiveFilter}
                  />
                </div>

                {/* Issues list */}
                <div
                  className="flex-1 overflow-y-auto p-3"
                  role="region"
                  aria-label="Audit issues list"
                  aria-live="polite"
                >
                  {filteredIssues.length === 0 ? (
                    <p className="text-center text-[11px] text-zinc-600 py-4">
                      No {activeFilter === 'all' ? '' : activeFilter} issues found.
                    </p>
                  ) : (
                    <ul
                      className="flex flex-col gap-2"
                      aria-label={`${filteredIssues.length} audit issue${filteredIssues.length !== 1 ? 's' : ''}`}
                    >
                      {filteredIssues.map((issue, idx) => (
                        <IssueRow
                          key={`${issue.rule}-${issue.line}-${idx}`}
                          issue={issue}
                          defaultExpanded={issue.severity === 'error'}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer legend */}
      <div className="border-t border-white/5 px-5 py-2 flex items-center gap-4">
        <span className="flex items-center gap-1 text-[9px] text-zinc-600">
          <AlertCircle className="h-2.5 w-2.5 text-red-500" aria-hidden="true" />
          Error
        </span>
        <span className="flex items-center gap-1 text-[9px] text-zinc-600">
          <AlertTriangle className="h-2.5 w-2.5 text-amber-500" aria-hidden="true" />
          Warning
        </span>
        <span className="flex items-center gap-1 text-[9px] text-zinc-600">
          <Info className="h-2.5 w-2.5 text-blue-500" aria-hidden="true" />
          Info
        </span>
        <span className="ml-auto text-[9px] font-bold tracking-widest text-zinc-700 uppercase">
          Interface Accessibility
        </span>
      </div>
    </section>
  );
}
