import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  FolderPlus,
  FilePlus,
  Search,
  MoreHorizontal,
  LayoutGrid,
  Filter,
  History,
  FileCode,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileManager, FileNode } from '../../lib/explorer/FileManager';
import { FileTreeNode } from './FileTreeNode';
import { cn } from '../../lib/utils';

export const FileExplorer: React.FC = () => {
  const [fileManager] = useState(() => new FileManager());
  const [nodes, setNodes] = useState<FileNode[]>(fileManager.getAllNodes());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      try {
        const overNode = fileManager.getNode(over.id as string);
        if (overNode) {
          const newParentId = overNode.type === 'folder' ? overNode.id : overNode.parentId;
          if (newParentId) {
            fileManager.moveNode(active.id as string, newParentId);
            setNodes([...fileManager.getAllNodes()]);
          }
        }
      } catch (error) {
        console.error('Move failed:', error);
      }
    }
    setActiveId(null);
  };

  const handleToggle = useCallback(
    (id: string) => {
      fileManager.toggleFolder(id);
      setNodes([...fileManager.getAllNodes()]);
    },
    [fileManager]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const node = fileManager.getNode(id);
      if (node && node.type === 'file' && !openFiles.includes(id)) {
        setOpenFiles((prev) => [id, ...prev].slice(0, 5));
      }
    },
    [fileManager, openFiles]
  );

  const handleAction = useCallback(
    (action: string, id: string) => {
      if (action === 'delete') {
        fileManager.deleteNode(id);
        setOpenFiles((prev) => prev.filter((fid) => fid !== id));
      } else if (action === 'new-file') {
        fileManager.createFile(id, 'new_file.rs');
      } else if (action === 'new-folder') {
        fileManager.createFolder(id, 'new_folder');
      }
      setNodes([...fileManager.getAllNodes()]);
    },
    [fileManager]
  );

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    return nodes.filter((n) => n.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [nodes, searchQuery]);

  const renderTree = (parentId: string | null, depth: number = 0): React.ReactNode => {
    return nodes
      .filter((node) => node.parentId === parentId)
      .map((node) => (
        <FileTreeNode
          key={node.id}
          node={node}
          depth={depth}
          onToggle={handleToggle}
          onSelect={handleSelect}
          onAction={handleAction}
          isSelected={selectedId === node.id}
          childrenNodes={
            node.type === 'folder' && node.isOpen ? renderTree(node.id, depth + 1) : null
          }
        />
      ));
  };

  return (
    <div className="z-20 flex h-full w-64 flex-col overflow-hidden border-r border-white/5 bg-[#09090b] shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
      {/* Search Header */}
      <div className="flex flex-col gap-5 bg-black/20 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Navigator
          </h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleAction('new-file', fileManager.getRootId()!)}
              className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleAction('new-folder', fileManager.getRootId()!)}
              className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="group relative">
          <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-gray-600 transition-colors group-focus-within:text-red-500" />
          <input
            type="text"
            placeholder="Go to file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pr-3 pl-9 text-xs text-gray-300 placeholder-gray-600 transition-all focus:border-red-500/50 focus:ring-1 focus:ring-red-500/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="custom-scrollbar flex-grow overflow-y-auto">
        {/* Open Editors Section */}
        {openFiles.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 px-5 py-2 text-[9px] font-black tracking-widest text-gray-600 uppercase">
              <History className="h-3 w-3" />
              <span>Open Editors</span>
            </div>
            <div className="space-y-0.5 px-2">
              {openFiles.map((id) => {
                const node = fileManager.getNode(id);
                return node ? (
                  <div
                    key={id}
                    onClick={() => handleSelect(id)}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-xs transition-all',
                      selectedId === id
                        ? 'bg-red-500/10 text-white'
                        : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <FileCode className="h-3.5 w-3.5 text-red-500/60" />
                      <span className="truncate">{node.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenFiles((prev) => prev.filter((fid) => fid !== id));
                      }}
                      className="rounded p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* File Tree Section */}
        <div className="flex items-center gap-2 px-5 py-2 text-[9px] font-black tracking-widest text-gray-600 uppercase">
          <LayoutGrid className="h-3 w-3" />
          <span>Files</span>
        </div>

        <div className="px-2 pb-10">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">{fileManager.getRootId() && renderTree(null)}</div>
            </SortableContext>

            <DragOverlay
              dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                  styles: { active: { opacity: '0.4' } },
                }),
              }}
            >
              {activeId ? (
                <div className="flex scale-105 items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-xl">
                  <FileCode className="mr-3 h-4 w-4 text-red-500" />
                  {nodes.find((n) => n.id === activeId)?.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 bg-black/40 p-4 text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <span>Ready</span>
        </div>
        <Filter className="h-3 w-3 cursor-pointer transition-colors hover:text-white" />
      </div>
    </div>
  );
};
