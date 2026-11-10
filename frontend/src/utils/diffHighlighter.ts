export type DiffOperation = -1 | 0 | 1; // -1 = DELETE, 0 = EQUAL, 1 = INSERT
export type DiffTuple = [DiffOperation, string];

export interface CharacterSpan {
  op: DiffOperation;
  text: string;
}

export interface DiffChunk {
  id: string;
  originalStartLine: number;
  modifiedStartLine: number;
  originalLines: string[];
  modifiedLines: string[];
  characterSpans: CharacterSpan[];
  hasChanges: boolean;
}

export interface DiffComputationResult {
  chunks: DiffChunk[];
  unifiedDiff: string;
  additions: number;
  deletions: number;
}

/**
 * Character-level diff-match-patch compatible engine with semantic cleanup.
 */
export function computeCharacterDiff(original: string, modified: string): CharacterSpan[] {
  if (original === modified) {
    return original.length > 0 ? [{ op: 0, text: original }] : [];
  }
  if (original.length === 0) {
    return [{ op: 1, text: modified }];
  }
  if (modified.length === 0) {
    return [{ op: -1, text: original }];
  }

  // Common prefix
  let prefixLen = 0;
  const minLen = Math.min(original.length, modified.length);
  while (prefixLen < minLen && original[prefixLen] === modified[prefixLen]) {
    prefixLen++;
  }

  // Common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    original[original.length - 1 - suffixLen] === modified[modified.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = original.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? original.slice(original.length - suffixLen) : '';
  const midOriginal = original.slice(prefixLen, original.length - suffixLen);
  const midModified = modified.slice(prefixLen, modified.length - suffixLen);

  const spans: CharacterSpan[] = [];
  if (prefix) {
    spans.push({ op: 0, text: prefix });
  }

  if (midOriginal && midModified) {
    const tokenSpans = lcsTokenDiff(tokenize(midOriginal), tokenize(midModified));
    spans.push(...mergeAdjacentSpans(tokenSpans));
  } else if (midOriginal) {
    spans.push({ op: -1, text: midOriginal });
  } else if (midModified) {
    spans.push({ op: 1, text: midModified });
  }

  if (suffix) {
    spans.push({ op: 0, text: suffix });
  }

  return mergeAdjacentSpans(spans);
}

function tokenize(input: string): string[] {
  return input.match(/\w+|\s+|[^\w\s]/g) ?? [input];
}

function lcsTokenDiff(a: string[], b: string[]): CharacterSpan[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: CharacterSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ op: 0, text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ op: -1, text: a[i] });
      i++;
    } else {
      result.push({ op: 1, text: b[j] });
      j++;
    }
  }
  while (i < m) {
    result.push({ op: -1, text: a[i++] });
  }
  while (j < n) {
    result.push({ op: 1, text: b[j++] });
  }

  return result;
}

function mergeAdjacentSpans(spans: CharacterSpan[]): CharacterSpan[] {
  const merged: CharacterSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.op === span.op) {
      prev.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Computes structured line and character diff chunks between two contract versions.
 */
export function computeCodeDiff(originalCode: string, modifiedCode: string): DiffComputationResult {
  const origLines = originalCode.split('\n');
  const modLines = modifiedCode.split('\n');

  const m = origLines.length;
  const n = modLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origLines[i] === modLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  type RawStep = { type: 'equal' | 'delete' | 'insert'; origLine?: string; modLine?: string };
  const steps: RawStep[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (origLines[i] === modLines[j]) {
      steps.push({ type: 'equal', origLine: origLines[i], modLine: modLines[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      steps.push({ type: 'delete', origLine: origLines[i] });
      i++;
    } else {
      steps.push({ type: 'insert', modLine: modLines[j] });
      j++;
    }
  }
  while (i < m) {
    steps.push({ type: 'delete', origLine: origLines[i++] });
  }
  while (j < n) {
    steps.push({ type: 'insert', modLine: modLines[j++] });
  }

  const chunks: DiffChunk[] = [];
  let additions = 0;
  let deletions = 0;
  let origLineCursor = 1;
  let modLineCursor = 1;
  let idx = 0;

  while (idx < steps.length) {
    const step = steps[idx];
    if (step.type === 'equal') {
      const origBucket: string[] = [];
      const modBucket: string[] = [];
      const startOrig = origLineCursor;
      const startMod = modLineCursor;
      while (idx < steps.length && steps[idx].type === 'equal') {
        origBucket.push(steps[idx].origLine ?? '');
        modBucket.push(steps[idx].modLine ?? '');
        origLineCursor++;
        modLineCursor++;
        idx++;
      }
      chunks.push({
        id: `chunk-${chunks.length}`,
        originalStartLine: startOrig,
        modifiedStartLine: startMod,
        originalLines: origBucket,
        modifiedLines: modBucket,
        characterSpans: [{ op: 0, text: origBucket.join('\n') }],
        hasChanges: false,
      });
    } else {
      const origBucket: string[] = [];
      const modBucket: string[] = [];
      const startOrig = origLineCursor;
      const startMod = modLineCursor;
      while (idx < steps.length && steps[idx].type !== 'equal') {
        if (steps[idx].type === 'delete') {
          origBucket.push(steps[idx].origLine ?? '');
          origLineCursor++;
          deletions++;
        } else {
          modBucket.push(steps[idx].modLine ?? '');
          modLineCursor++;
          additions++;
        }
        idx++;
      }
      const charSpans = computeCharacterDiff(origBucket.join('\n'), modBucket.join('\n'));
      chunks.push({
        id: `chunk-${chunks.length}`,
        originalStartLine: startOrig,
        modifiedStartLine: startMod,
        originalLines: origBucket,
        modifiedLines: modBucket,
        characterSpans: charSpans,
        hasChanges: true,
      });
    }
  }

  const unifiedLines: string[] = [];
  for (const chunk of chunks) {
    if (!chunk.hasChanges) {
      for (const line of chunk.originalLines) {
        unifiedLines.push(`  ${line}`);
      }
    } else {
      for (const line of chunk.originalLines) {
        unifiedLines.push(`- ${line}`);
      }
      for (const line of chunk.modifiedLines) {
        unifiedLines.push(`+ ${line}`);
      }
    }
  }

  return {
    chunks,
    unifiedDiff: unifiedLines.join('\n'),
    additions,
    deletions,
  };
}

/**
 * Reverts a specific changed chunk back to its original lines and returns the updated modified code.
 */
export function revertDiffChunk(
  chunks: DiffChunk[],
  chunkIdToRevert: string
): string {
  const resultingLines: string[] = [];
  for (const chunk of chunks) {
    if (chunk.id === chunkIdToRevert) {
      resultingLines.push(...chunk.originalLines);
    } else {
      resultingLines.push(...chunk.modifiedLines);
    }
  }
  return resultingLines.join('\n');
}
