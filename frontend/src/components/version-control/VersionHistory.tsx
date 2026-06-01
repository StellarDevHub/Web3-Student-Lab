'use client';

import { useState, useMemo } from 'react';
import { Clock, ArrowLeft, ArrowRight, RotateCcw, GitBranch, FileText } from 'lucide-react';
import { VersionControl, type Version, type DocumentEntry } from '@/lib/version-control/engine';
import { formatDistanceToNow } from '@/lib/utils';

interface VersionHistoryProps {
  documentId: string;
  onRollback?: (version: Version) => void;
  onClose?: () => void;
}

export function VersionHistory({ documentId, onRollback, onClose }: VersionHistoryProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const doc = useMemo(() => VersionControl.getDocument(documentId), [documentId]);
  const versions = useMemo(
    () => (doc ? VersionControl.getVersionHistory(documentId) : []),
    [documentId, doc]
  );

  const selectedVersion = useMemo(
    () => (selectedVersionId && doc ? VersionControl.getVersion(documentId, selectedVersionId) : null),
    [documentId, selectedVersionId, doc]
  );

  const diffLines = useMemo(() => {
    if (!showDiff || !selectedVersionId || !compareVersionId) return null;
    return VersionControl.compareVersions(documentId, selectedVersionId, compareVersionId);
  }, [documentId, selectedVersionId, compareVersionId, showDiff]);

  if (!doc) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/4 p-8 text-center">
        <p className="text-[var(--muted)]">Document not found</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/4">
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/8 bg-white/4 p-2 text-[var(--muted)] transition-colors hover:text-[var(--text-strong)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-strong)]">
              Version History
            </h3>
            <p className="text-xs text-[var(--muted)]">
              {doc.title} &middot; {versions.length} versions
            </p>
          </div>
        </div>

        {versions.length >= 2 && (
          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors ${
              showDiff
                ? 'border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10 text-[var(--brand-strong)]'
                : 'border-white/8 bg-white/4 text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            {showDiff ? 'Exit diff' : 'Compare versions'}
          </button>
        )}
      </div>

      {showDiff && (
        <div className="border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedVersionId || ''}
              onChange={(e) => setSelectedVersionId(e.target.value || null)}
              className="flex-1 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-[var(--text-strong)] outline-none"
            >
              <option value="">Select version A</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber}: {v.message}
                </option>
              ))}
            </select>
            <ArrowRight className="h-4 w-4 text-[var(--muted)]" />
            <select
              value={compareVersionId || ''}
              onChange={(e) => setCompareVersionId(e.target.value || null)}
              className="flex-1 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-[var(--text-strong)] outline-none"
            >
              <option value="">Select version B</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber}: {v.message}
                </option>
              ))}
            </select>
          </div>

          {diffLines && (
            <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-white/8 bg-black/20 font-mono text-xs">
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex px-4 py-1 ${
                    line.type === 'added'
                      ? 'bg-green-500/10 text-green-400'
                      : line.type === 'removed'
                        ? 'bg-red-500/10 text-red-400'
                        : 'text-[var(--muted)]'
                  }`}
                >
                  <span className="mr-4 w-8 shrink-0 text-right opacity-50">
                    {line.lineNumber}
                  </span>
                  <span className="mr-2 w-4 shrink-0">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="break-all">{line.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-white/8">
        {versions.map((version, index) => (
          <VersionRow
            key={version.id}
            version={version}
            isLatest={index === 0}
            isSelected={selectedVersionId === version.id}
            onSelect={() =>
              setSelectedVersionId(
                selectedVersionId === version.id ? null : version.id
              )
            }
            onRollback={() => onRollback?.(version)}
          />
        ))}
      </div>

      {selectedVersion && !showDiff && (
        <div className="border-t border-white/8 px-6 py-4">
          <h4 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">
            {selectedVersion.title}
          </h4>
          <pre className="max-h-60 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs text-[var(--muted)] whitespace-pre-wrap">
            {selectedVersion.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function VersionRow({
  version,
  isLatest,
  isSelected,
  onSelect,
  onRollback,
}: {
  version: Version;
  isLatest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRollback: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-4 px-6 py-4 transition-colors ${
        isSelected ? 'bg-white/5' : ''
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isLatest
            ? 'bg-[var(--brand-strong)]/10 text-[var(--brand-strong)]'
            : 'bg-white/5 text-[var(--muted)]'
        }`}
      >
        {isLatest ? <GitBranch className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-[var(--text-strong)]">
            v{version.versionNumber}
          </span>
          {isLatest && (
            <span className="rounded-full bg-[var(--brand-strong)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--brand-strong)]">
              Latest
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-[var(--text-strong)]">
          {version.message}
        </p>
        <div className="mt-1 flex items-center gap-4 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(version.timestamp)}
          </span>
          <span>by {version.author}</span>
        </div>
        {version.tags && version.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {version.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-[var(--muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onSelect}
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
            isSelected
              ? 'border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10 text-[var(--brand-strong)]'
              : 'border-white/8 bg-white/4 text-[var(--muted)] hover:text-[var(--text-strong)]'
          }`}
        >
          View
        </button>
        {!isLatest && (
          <button
            onClick={onRollback}
            className="inline-flex items-center gap-1 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-1.5 text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/10"
          >
            <RotateCcw className="h-3 w-3" />
            Rollback
          </button>
        )}
      </div>
    </div>
  );
}
