'use client';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { AuditLogRecord } from '@/hooks/useAuditLogs';
import { Check, Copy, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';

interface LogDetailModalProps {
  log: AuditLogRecord | null;
  onClose: () => void;
}

const FIELDS: { key: keyof AuditLogRecord; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'createdAt', label: 'Timestamp' },
  { key: 'action', label: 'Action' },
  { key: 'userEmail', label: 'User' },
  { key: 'userId', label: 'User ID' },
  { key: 'entity', label: 'Entity' },
  { key: 'entityId', label: 'Entity ID' },
  { key: 'ipAddress', label: 'IP Address' },
  { key: 'userAgent', label: 'User Agent' },
  { key: 'prevHash', label: 'Prev Hash' },
];

/**
 * Tokenise pretty-printed JSON into coloured spans. Rendered as React text
 * nodes (never `dangerouslySetInnerHTML`), so payload contents cannot inject markup.
 */
function highlightJson(json: string) {
  const tokenPattern = /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenPattern.exec(json)) !== null) {
    if (match.index > lastIndex) parts.push(json.slice(lastIndex, match.index));
    const token = match[0];
    const className = token.startsWith('"')
      ? token.trimEnd().endsWith(':')
        ? 'text-sky-300'
        : 'text-emerald-300'
      : /true|false|null/.test(token)
        ? 'text-fuchsia-300'
        : 'text-amber-300';
    parts.push(
      <span key={key++} className={className}>
        {token}
      </span>,
    );
    lastIndex = match.index + token.length;
  }
  if (lastIndex < json.length) parts.push(json.slice(lastIndex));
  return parts;
}

export function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useFocusTrap(dialogRef, { enabled: log !== null, onEscape: onClose });

  const payload = useMemo(() => {
    if (!log) return '';
    try {
      return JSON.stringify(log.details ?? null, null, 2);
    } catch {
      return String(log.details);
    }
  }, [log]);

  const highlighted = useMemo(() => highlightJson(payload), [payload]);

  if (!log) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-detail-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 id="log-detail-title" className="text-sm font-black tracking-[0.2em] text-white uppercase">
              {log.action}
            </h2>
            <p className="font-mono text-xs text-zinc-500">{log.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close log details"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="contents">
                <dt className="text-zinc-500">{label}</dt>
                <dd className="font-mono break-all text-zinc-200">{String(log[key] ?? '—')}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-5 mb-2 text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase">
            Payload
          </h3>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed text-zinc-300">
            <code>{highlighted}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

export default LogDetailModal;
