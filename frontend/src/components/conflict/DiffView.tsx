'use client';


export interface DiffLine {
  type: 'insert' | 'delete' | 'equal';
  text: string;
  lineNumberLeft?: number;
  lineNumberRight?: number;
}

interface DiffViewProps {
  mine: string;
  theirs: string;
  highlightedLines?: number[];
}

export default function DiffView({ mine, theirs, highlightedLines = [] }: DiffViewProps) {
  const diffLines = computeLineDiff(mine, theirs);

  return (
    <div className="flex gap-0 border border-zinc-700 rounded-lg overflow-hidden font-mono text-sm">
      {/* Left pane - Mine */}
      <div className="flex-1 border-r border-zinc-700 bg-zinc-900">
        <div className="px-3 py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wide border-b border-zinc-700">
          Mine
        </div>
        <div className="overflow-auto max-h-[400px]">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={`flex ${
                line.type === 'delete'
                  ? 'bg-red-900/30'
                  : line.type === 'insert'
                  ? 'bg-transparent'
                  : highlightedLines.includes(i)
                  ? 'bg-yellow-900/20'
                  : ''
              }`}
            >
              <span className="w-10 text-right pr-2 text-zinc-600 select-none flex-shrink-0 py-0.5">
                {line.lineNumberLeft || ''}
              </span>
              <span className={`py-0.5 ${line.type === 'delete' ? 'text-red-400' : 'text-zinc-300'}`}>
                {line.type !== 'insert' ? line.text : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right pane - Theirs */}
      <div className="flex-1 bg-zinc-900">
        <div className="px-3 py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wide border-b border-zinc-700">
          Theirs
        </div>
        <div className="overflow-auto max-h-[400px]">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={`flex ${
                line.type === 'insert'
                  ? 'bg-green-900/30'
                  : line.type === 'delete'
                  ? 'bg-transparent'
                  : highlightedLines.includes(i)
                  ? 'bg-yellow-900/20'
                  : ''
              }`}
            >
              <span className="w-10 text-right pr-2 text-zinc-600 select-none flex-shrink-0 py-0.5">
                {line.lineNumberRight || ''}
              </span>
              <span className={`py-0.5 ${line.type === 'insert' ? 'text-green-400' : 'text-zinc-300'}`}>
                {line.type !== 'delete' ? line.text : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function computeLineDiff(mine: string, theirs: string): DiffLine[] {
  const mineLines = mine.split('\n');
  const theirsLines = theirs.split('\n');
  const result: DiffLine[] = [];

  const maxLen = Math.max(mineLines.length, theirsLines.length);
  let mineLineNum = 1;
  let theirsLineNum = 1;

  for (let i = 0; i < maxLen; i++) {
    const mLine = mineLines[i];
    const tLine = theirsLines[i];

    if (mLine === undefined && tLine !== undefined) {
      result.push({
        type: 'insert',
        text: tLine,
        lineNumberRight: theirsLineNum++,
      });
    } else if (mLine !== undefined && tLine === undefined) {
      result.push({
        type: 'delete',
        text: mLine,
        lineNumberLeft: mineLineNum++,
      });
    } else if (mLine !== tLine) {
      result.push({
        type: 'delete',
        text: mLine,
        lineNumberLeft: mineLineNum++,
      });
      result.push({
        type: 'insert',
        text: tLine,
        lineNumberRight: theirsLineNum++,
      });
    } else {
      result.push({
        type: 'equal',
        text: mLine,
        lineNumberLeft: mineLineNum++,
        lineNumberRight: theirsLineNum++,
      });
    }
  }

  return result;
}
