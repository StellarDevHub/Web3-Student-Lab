/// <reference lib="webworker" />

import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';
import type {
  DiffChunk,
  DiffSegment,
  DiffWorkerRequest,
  DiffWorkerResponse,
} from './diffTypes';
import { computeDiffHunks, type DiffResult as HunkDiffResult } from './diffUtils';

type WorkerSelf = typeof self & { postMessage(message: any): void };
const workerSelf = self as WorkerSelf;

const dmp = new DiffMatchPatch();

/** Split a diff op's text into lines, keeping trailing newlines on each line. */
function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split(/(?<=\n)/);
}

/**
 * Compute character-level segments for a chunk by re-diffing its removed and
 * added text. Kept separate so Monaco decorations and the chunk list can both
 * render inline add/remove highlights.
 */
function charSegments(originalText: string, modifiedText: string): DiffSegment[] {
  const ops = dmp.diff_main(originalText, modifiedText);
  const segments: DiffSegment[] = [];
  for (const [op, text] of ops) {
    if (!text) continue;
    if (op === 0) segments.push({ text, kind: 'same' });
    else if (op === 1) segments.push({ text, kind: 'add' });
    else segments.push({ text, kind: 'remove' });
  }
  return segments;
}

/**
 * Compute a line-level chunk model from two code strings.
 */
export function computeDiff(original: string, modified: string): {
  chunks: DiffChunk[];
  identical: boolean;
} {
  if (original === modified) {
    return { chunks: [], identical: true };
  }

  const chars = dmp.diff_linesToChars(original, modified);
  const lineOps = dmp.diff_main(chars.chars1, chars.chars2, false);
  dmp.diff_charsToLines(lineOps, chars.lineArray);

  const chunks: DiffChunk[] = [];
  let originalLine = 1;
  let modifiedLine = 1;

  let regionStartOriginal = 1;
  let regionStartModified = 1;
  let pendingOriginal: string[] = [];
  let pendingModified: string[] = [];

  const flush = (): void => {
    if (pendingOriginal.length === 0 && pendingModified.length === 0) return;
    const kind =
      pendingOriginal.length > 0 && pendingModified.length > 0
        ? 'replace'
        : pendingModified.length > 0
          ? 'add'
          : 'remove';
    chunks.push({
      id: `chunk-${chunks.length}`,
      kind,
      startLineOriginal: regionStartOriginal,
      startLineModified: regionStartModified,
      originalLines: pendingOriginal,
      modifiedLines: pendingModified,
      segments: charSegments(pendingOriginal.join(''), pendingModified.join('')),
    });
    pendingOriginal = [];
    pendingModified = [];
  };

  for (const [op, text] of lineOps) {
    const lines = splitLines(text);
    if (op === 0) {
      flush();
      originalLine += lines.length;
      modifiedLine += lines.length;
      continue;
    }
    if (pendingOriginal.length === 0 && pendingModified.length === 0) {
      regionStartOriginal = originalLine;
      regionStartModified = modifiedLine;
    }
    if (op === 1) {
      pendingModified.push(...lines);
      modifiedLine += lines.length;
    } else {
      pendingOriginal.push(...lines);
      originalLine += lines.length;
    }
  }
  flush();

  return { chunks, identical: false };
}

// Handle both InteractiveDiffViewer (type: 'diff') and DiffViewer (id, original, modified)
self.onmessage = (event: MessageEvent<any>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'diff') {
    const { requestId, original, modified } = data;
    try {
      const result = computeDiff(original, modified);
      workerSelf.postMessage({ type: 'diff-result', requestId, result });
    } catch (err) {
      workerSelf.postMessage({
        type: 'diff-error',
        requestId,
        message: err instanceof Error ? err.message : 'Diff computation failed.',
      });
    }
  } else if ('id' in data) {
    const { id, original, modified } = data;
    const result: HunkDiffResult = computeDiffHunks(original, modified);
    workerSelf.postMessage({ id, result });
  }
};

export {};
