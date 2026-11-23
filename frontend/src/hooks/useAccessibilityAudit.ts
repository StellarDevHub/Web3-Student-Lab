'use client';

import {
    auditSorobanSource,
    type AuditResult,
    type AuditSeverity,
} from '@/lib/editor/SorobanAccessibilityAuditor';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAccessibilityAuditOptions {
  /**
   * Debounce in milliseconds before re-running the audit after a source change.
   * Defaults to 400 ms to avoid blocking the editor on every keystroke.
   */
  debounceMs?: number;
  /** When false, the audit will not run. Defaults to true. */
  enabled?: boolean;
}

export interface UseAccessibilityAuditReturn {
  /** Latest audit result; null before the first audit completes */
  result: AuditResult | null;
  /** True while a debounced audit is pending */
  isPending: boolean;
  /** Manually trigger an immediate (non-debounced) re-audit */
  runAudit: () => void;
  /** Filter the current result down to a single severity */
  getIssuesBySeverity: (severity: AuditSeverity) => AuditResult['issues'];
}

export function useAccessibilityAudit(
  source: string,
  {
    debounceMs = 400,
    enabled = true,
  }: UseAccessibilityAuditOptions = {}
): UseAccessibilityAuditReturn {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const runAudit = useCallback(() => {
    if (!enabled) return;
    setIsPending(false);
    const auditResult = auditSorobanSource(sourceRef.current);
    setResult(auditResult);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setIsPending(false);
      return;
    }

    setIsPending(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      runAudit();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [source, debounceMs, enabled, runAudit]);

  const getIssuesBySeverity = useCallback(
    (severity: AuditSeverity) => {
      if (!result) return [];
      return result.issues.filter((i) => i.severity === severity);
    },
    [result]
  );

  return { result, isPending, runAudit, getIssuesBySeverity };
}
