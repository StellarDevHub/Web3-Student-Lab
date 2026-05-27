'use client';

import { PanelLayout } from '@/hooks/useLayoutPersistence';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ReactNode } from 'react';

interface Props {
  panel: PanelLayout;
  editMode: boolean;
  onResizeCol: (id: string, colSpan: number) => void;
  children: ReactNode;
}

const colSpanClass: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-3',
};

export default function DraggablePanel({ panel, editMode, onResizeCol, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
    disabled: !editMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${colSpanClass[panel.colSpan] ?? 'col-span-1 md:col-span-3'} relative ${
        editMode ? 'rounded-2xl ring-2 ring-red-500/50 ring-offset-2 ring-offset-black' : ''
      }`}
    >
      {editMode && (
        <div className="absolute -top-3 right-0 left-0 z-30 flex items-center justify-between px-3">
          {/* drag handle */}
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab rounded-full bg-red-600 px-3 py-1 text-[10px] font-black tracking-widest text-white uppercase select-none active:cursor-grabbing"
          >
            ⠿ drag
          </button>

          {/* col-span controls */}
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => onResizeCol(panel.id, n)}
                className={`h-6 w-6 rounded border text-[10px] font-black transition-colors ${
                  panel.colSpan === n
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-white/20 bg-zinc-900 text-gray-400 hover:border-red-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={editMode ? 'pt-4' : ''}>{children}</div>
    </div>
  );
}
