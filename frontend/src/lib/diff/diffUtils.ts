/**
 * diffUtils.ts — Issue #1145
 *
 * Pure, framework-free diff utilities used by the Soroban diff viewer:
 *  - `computeDiffHunks` splits two documents into line-level change hunks
 *    (character-level granularity comes from diff-match-patch underneath).
 *  - `applyHunk` merges a single selected solution hunk into a student
 *    buffer, powering the "Apply Diff Chunk" controls.
 *
 * These functions run both in the main thread (tests, fallback) and inside
 * the diff Web Worker, so they must stay free of DOM / Monaco imports.
 */

import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';

export interface DiffHunk {
  /** Stable id for React keys and apply-bookkeeping. */
  id: string;
  /** 0-based first line of the hunk in the original (student) document. */
  originalStart: number;
  /** Lines in the original document that this hunk replaces. */
  originalLines: string[];
  /** 0-based first line of the hunk in the modified (solution) document. */
  modifiedStart: number;
  /** Lines in the modified document that this hunk inserts/replaces with. */
  modifiedLines: string[];
}

export interface DiffResult {
  hunks: DiffHunk[];
  /** True when the two documents are character-identical. */
  identical: boolean;
}

const dmp = new DiffMatchPatch();

/** Number of equal context lines kept around each change run. */
const CONTEXT_LINES = 2;

/**
 * Computes the set of hunks needed to transform `original` into `modified`.
 * Uses diff-match-patch's line-mode diff (which internally performs
 * character-level matching), then groups contiguous changes into hunks with
 * a small equal-line context so the UI can offer chunk-by-chunk application.
 */
export function computeDiffHunks(original: string, modified: string): DiffResult {
  const originalLines = splitLines(original);
  const modifiedLines = splitLines(modified);

  if (originalLines.length === 0 && modifiedLines.length === 0) {
    return { hunks: [], identical: true };
  }

  // diff_linesToChars_ accepts full strings and internally splits on '\n';
  // diff_charsToLines_ then rehydrates each op back to newline-terminated
  // lines (except possibly the final unterminated line).
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(original, modified);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const hunks: DiffHunk[] = [];
  // Cursors advance through both documents as ops are consumed, so the
  // equal-run boundaries always sit at the true positions of the last
  // unchanged block.
  let originalCursor = 0;
  let modifiedCursor = 0;
  // [start, end) of the most recent equal run, used to draw context lines.
  let equalOriginalStart = 0;
  let equalOriginalEnd = 0;
  let equalModifiedStart = 0;
  let equalModifiedEnd = 0;

  const flushChange = (change: { original: string[]; modified: string[] }) => {
    if (change.original.length === 0 && change.modified.length === 0) {
      return;
    }
    const originalStart = Math.max(equalOriginalStart, equalOriginalEnd - CONTEXT_LINES);
    const contextBefore = originalLines.slice(originalStart, equalOriginalEnd);
    const modifiedStart = Math.max(equalModifiedStart, equalModifiedEnd - CONTEXT_LINES);
    const modifiedContextBefore = modifiedLines.slice(modifiedStart, equalModifiedEnd);

    hunks.push({
      id: `hunk-${hunks.length}`,
      originalStart,
      originalLines: [...contextBefore, ...change.original],
      modifiedStart,
      modifiedLines: [...modifiedContextBefore, ...change.modified],
    });
  };

  let pending: { original: string[]; modified: string[] } = { original: [], modified: [] };

  const consumeLines = (op: number, lines: string[]) => {
    if (lines.length === 0) {
      return;
    }
    if (op === 0) {
      // Equal run: flush any pending change, then record the new equal-run
      // boundaries from the current cursors.
      flushChange(pending);
      pending = { original: [], modified: [] };
      equalOriginalStart = originalCursor;
      equalModifiedStart = modifiedCursor;
      originalCursor += lines.length;
      modifiedCursor += lines.length;
      equalOriginalEnd = originalCursor;
      equalModifiedEnd = modifiedCursor;
    } else if (op === -1) {
      pending.original.push(...lines);
      originalCursor += lines.length;
    } else {
      pending.modified.push(...lines);
      modifiedCursor += lines.length;
    }
  };

  for (const [op, text] of diffs) {
    const lines = text === '' ? [] : text.split('\n');
    // diff-match-patch terminates lines with '\n'; drop the trailing empty
    // fragment produced by a trailing newline.
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    consumeLines(op, lines);
  }
  flushChange(pending);

  return { hunks, identical: hunks.length === 0 };
}

/**
 * Applies a single solution hunk to the student buffer, replacing the
 * original line range with the modified (solution) lines. Returns the new
 * full buffer, or the original buffer unchanged when the hunk's source lines
 * no longer match (stale hunk after earlier edits).
 */
export function applyHunk(buffer: string, hunk: DiffHunk): string {
  const lines = splitLines(buffer);

  // Hunk out of range — stale.
  if (hunk.originalStart > lines.length) {
    return buffer;
  }

  const actualSource = lines.slice(hunk.originalStart, hunk.originalStart + hunk.originalLines.length);

  // The hunk's context must still match, otherwise the buffer has drifted.
  if (!sameLines(actualSource, hunk.originalLines)) {
    return buffer;
  }

  const next = [
    ...lines.slice(0, hunk.originalStart),
    ...hunk.modifiedLines,
    ...lines.slice(hunk.originalStart + hunk.originalLines.length),
  ];

  return joinLines(next);
}

/** Applies several hunks bottom-up so line indices stay valid. */
export function applyHunks(buffer: string, hunks: DiffHunk[]): string {
  const sorted = [...hunks].sort((a, b) => b.originalStart - a.originalStart);
  let next = buffer;
  for (const hunk of sorted) {
    next = applyHunk(next, hunk);
  }
  return next;
}

export function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  return text.split('\n');
}

export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

function sameLines(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
