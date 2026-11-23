import * as Y from 'yjs';

export type MergeStrategyType = 'mine' | 'theirs' | 'manual';

export interface MergeResult {
  success: boolean;
  mergedText?: string;
  error?: string;
}

export function resolveConflict(
  mine: string,
  theirs: string,
  base: string,
  strategy: MergeStrategyType,
  manualMerge?: string
): MergeResult {
  switch (strategy) {
    case 'mine':
      return { success: true, mergedText: mine };

    case 'theirs':
      return { success: true, mergedText: theirs };

    case 'manual':
      if (!manualMerge) {
        return { success: false, error: 'Manual merge text required' };
      }
      return { success: true, mergedText: manualMerge };

    default:
      return { success: false, error: `Unknown strategy: ${strategy}` };
  }
}

export function applyMergeToYjs(
  doc: Y.Doc,
  mergedText: string,
  undoManager: Y.UndoManager | null
): void {
  const yText = doc.getText('content');
  const previousContent = yText.toString();

  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, mergedText);
  });

  if (undoManager && mergedText !== previousContent) {
    undoManager.stopCapturing();
  }
}

export function broadcastResolution(
  doc: Y.Doc,
  conflictId: string,
  strategy: MergeStrategyType
): void {
  const resolutions = doc.getArray('conflict-resolutions');
  resolutions.push([
    {
      conflictId,
      strategy,
      timestamp: Date.now(),
      resolvedBy: doc.clientID,
    },
  ]);
}

export function getResolutionHistory(doc: Y.Doc): Array<{
  conflictId: string;
  strategy: MergeStrategyType;
  timestamp: number;
  resolvedBy: number;
}> {
  return doc.getArray('conflict-resolutions').toArray() as any[];
}
