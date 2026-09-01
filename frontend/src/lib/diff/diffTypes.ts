/**
 * Shared message and result types for the interactive diff viewer.
 *
 * Diff computation is offloaded to a Web Worker (`diff.worker.ts`) so large
 * multi-file comparisons never block the UI thread. The worker returns line
 * chunks with character-level segments; Monaco renders the visual diff while
 * the chunk list powers the one-click "Apply Diff Chunk" controls.
 */

/** Character-level segment inside a chunk (used for inline highlighting). */
export interface DiffSegment {
  text: string;
  kind: 'same' | 'add' | 'remove';
}

/** A contiguous hunk of changed lines between original and modified code. */
export interface DiffChunk {
  id: string;
  /** `replace` when the hunk has both removed and added lines. */
  kind: 'add' | 'remove' | 'replace';
  /** 1-based start line in the original document. */
  startLineOriginal: number;
  /** 1-based start line in the modified document. */
  startLineModified: number;
  /** Lines removed from the original (empty for pure adds). */
  originalLines: string[];
  /** Lines added in the modified document (empty for pure removes). */
  modifiedLines: string[];
  /** Character-level segments spanning the hunk. */
  segments: DiffSegment[];
}

/** Result of a diff computation. */
export interface DiffResult {
  /** Line hunks, in document order. */
  chunks: DiffChunk[];
  /** Whether the two inputs are identical. */
  identical: boolean;
}

/** Inbound request sent to the diff worker. */
export interface DiffWorkerRequest {
  type: 'diff';
  requestId: string;
  original: string;
  modified: string;
}

/** Outbound response posted by the diff worker. */
export type DiffWorkerResponse =
  | { type: 'diff-result'; requestId: string; result: DiffResult }
  | { type: 'diff-error'; requestId: string; message: string };
