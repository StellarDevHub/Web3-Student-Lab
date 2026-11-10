'use client';

import React, { useState } from 'react';
import {
  AuditReportSummary,
  AuditSeverity,
  SEVERITY_BADGE_STYLES,
} from '../../types/audit';
import { VulnerabilityCard } from './VulnerabilityCard';

export interface SecurityReportDrawerProps {
  report: AuditReportSummary;
  onJumpToLine?: (line: number, column: number) => void;
}

const SEVERITIES: AuditSeverity[] = [
  'Critical',
  'High',
  'Medium',
  'Informational',
];

export const SecurityReportDrawer: React.FC<SecurityReportDrawerProps> = ({
  report,
  onJumpToLine,
}) => {
  const [selectedSeverity, setSelectedSeverity] = useState<AuditSeverity | 'All'>('All');

  const filtered =
    selectedSeverity === 'All'
      ? report.findings
      : report.findings.filter((f) => f.severity === selectedSeverity);

  return (
    <section
      aria-label="Security Audit Report Drawer"
      data-testid="security-report-drawer"
      className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white">
            Visual Security Audit Report
          </h3>
          <p className="text-xs text-slate-400">
            Submission #{report.submissionId} • {report.findings.length} findings
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() =>
                setSelectedSeverity((prev) => (prev === sev ? 'All' : sev))
              }
              className={`rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE_STYLES[sev]}`}
            >
              {sev}: {report.counts[sev]}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3">
        {filtered.map((finding) => (
          <VulnerabilityCard
            key={finding.id}
            finding={finding}
            onJumpToLine={onJumpToLine}
          />
        ))}
      </div>
    </section>
  );
};
