'use client';

import { WorkspaceLayout } from '@/hooks/useLayoutPersistence';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { ReactNode } from 'react';
import DraggablePanel from './DraggablePanel';

// Snap-to-grid modifier — snaps drag delta to 8px grid
function snapToGrid(args: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) {
  const GRID = 8;
  return {
    ...args.transform,
    x: Math.round(args.transform.x / GRID) * GRID,
    y: Math.round(args.transform.y / GRID) * GRID,
  };
}

interface PanelDef {
  id: string;
  content: ReactNode;
}

interface Props {
  layout: WorkspaceLayout;
  editMode: boolean;
  panels: PanelDef[];
  onLayoutChange: (layout: WorkspaceLayout) => void;
}

export default function LayoutGrid({ layout, editMode, panels, onLayoutChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const orderedPanels = [...layout.panels].sort((a, b) => a.order - b.order);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedPanels.findIndex((p) => p.id === active.id);
    const newIndex = orderedPanels.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(orderedPanels, oldIndex, newIndex).map((p, i) => ({
      ...p,
      order: i,
    }));

    onLayoutChange({ panels: reordered });
  }

  function handleResizeCol(id: string, colSpan: number) {
    onLayoutChange({
      panels: layout.panels.map((p) => (p.id === id ? { ...p, colSpan } : p)),
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[snapToGrid]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedPanels.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {orderedPanels.map((panel) => {
            const def = panels.find((p) => p.id === panel.id);
            if (!def) return null;
            return (
              <DraggablePanel
                key={panel.id}
                panel={panel}
                editMode={editMode}
                onResizeCol={handleResizeCol}
              >
                {def.content}
              </DraggablePanel>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
