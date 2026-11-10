'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  computeCodeDiff,
  DiffChunk,
  revertDiffChunk,
} from '@/utils/diffHighlighter';

export type DiffViewMode = 'side-by-side' | 'inline';

export interface UseCodeDiffOptions {
  originalCode: string;
  initialModifiedCode: string;
  defaultMode?: DiffViewMode;
  onApplyModifiedCode?: (updatedCode: string) => void;
}

export interface UseCodeDiffReturn {
  mode: DiffViewMode;
  setMode: (mode: DiffViewMode) => void;
  modifiedCode: string;
  setModifiedCode: (code: string) => void;
  chunks: DiffChunk[];
  unifiedDiff: string;
  additions: number;
  deletions: number;
  copied: boolean;
  revertChunk: (chunkId: string) => string;
  copyDiffToClipboard: () => Promise<boolean>;
}

export function useCodeDiff({
  originalCode,
  initialModifiedCode,
  defaultMode = 'side-by-side',
  onApplyModifiedCode,
}: UseCodeDiffOptions): UseCodeDiffReturn {
  const [mode, setMode] = useState<DiffViewMode>(defaultMode);
  const [modifiedCode, setModifiedCode] = useState<string>(initialModifiedCode);
  const [copied, setCopied] = useState(false);

  const diffResult = useMemo(
    () => computeCodeDiff(originalCode, modifiedCode),
    [originalCode, modifiedCode]
  );

  const revertChunk = useCallback(
    (chunkId: string) => {
      const nextCode = revertDiffChunk(diffResult.chunks, chunkId);
      setModifiedCode(nextCode);
      onApplyModifiedCode?.(nextCode);
      return nextCode;
    },
    [diffResult.chunks, onApplyModifiedCode]
  );

  const copyDiffToClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diffResult.unifiedDiff);
      }
      setCopied(true);
      return true;
    } catch {
      setCopied(false);
      return false;
    }
  }, [diffResult.unifiedDiff]);

  return {
    mode,
    setMode,
    modifiedCode,
    setModifiedCode,
    chunks: diffResult.chunks,
    unifiedDiff: diffResult.unifiedDiff,
    additions: diffResult.additions,
    deletions: diffResult.deletions,
    copied,
    revertChunk,
    copyDiffToClipboard,
  };
}
