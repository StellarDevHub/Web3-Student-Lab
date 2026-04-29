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
  X
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
        console.error("Move failed:", error);
      }
    }
    setActiveId(null);
  };

  const handleToggle = useCallback((id: string) => {
    fileManager.toggleFolder(id);
    setNodes([...fileManager.getAllNodes()]);
  }, [fileManager]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const node = fileManager.getNode(id);
    if (node && node.type === 'file' && !openFiles.includes(id)) {
        setOpenFiles(prev => [id, ...prev].slice(0, 5));
    }
  }, [fileManager, openFiles]);

  const handleAction = useCallback((action: string, id: string) => {
    if (action === 'delete') {
      fileManager.deleteNode(id);
      setOpenFiles(prev => prev.filter(fid => fid !== id));
    } else if (action === 'new-file') {
      fileManager.createFile(id, 'new_file.rs');
    } else if (action === 'new-folder') {
      fileManager.createFolder(id, 'new_folder');
    }
    setNodes([...fileManager.getAllNodes()]);
  }, [fileManager]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    return nodes.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()));
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
          childrenNodes={node.type === 'folder' && node.isOpen ? renderTree(node.id, depth + 1) : null}
        />
      ));
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] border-r border-white/5 w-64 shadow-[20px_0_50px_rgba(0,0,0,0.5)] z-20 overflow-hidden">
      {/* Search Header */}
      <div className="p-5 flex flex-col gap-5 bg-black/20">
        <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Navigator
            </h2>
            <div className="flex items-center gap-0.5">
                <button onClick={() => handleAction('new-file', fileManager.getRootId()!)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all">
                    <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAction('new-folder', fileManager.getRootId()!)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all">
                    <FolderPlus className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 group-focus-within:text-red-500 transition-colors" />
          <input
            type="text"
            placeholder="Go to file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/40 focus:border-red-500/50 transition-all"
          />
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {/* Open Editors Section */}
        {openFiles.length > 0 && (
            <div className="mb-6">
                <div className="px-5 py-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600">
                    <History className="w-3 h-3" />
                    <span>Open Editors</span>
                </div>
                <div className="px-2 space-y-0.5">
                    {openFiles.map(id => {
                        const node = fileManager.getNode(id);
                        return node ? (
                            <div 
                                key={id} 
                                onClick={() => handleSelect(id)}
                                className={cn(
                                    "flex items-center justify-between group px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all",
                                    selectedId === id ? "bg-red-500/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                                )}
                            >
                                <div className="flex items-center gap-2.5 truncate">
                                    <FileCode className="w-3.5 h-3.5 text-red-500/60" />
                                    <span className="truncate">{node.name}</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setOpenFiles(prev => prev.filter(fid => fid !== id)); }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ) : null;
                    })}
                </div>
            </div>
        )}

        {/* File Tree Section */}
        <div className="px-5 py-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600">
            <LayoutGrid className="w-3 h-3" />
            <span>Files</span>
        </div>
        
        <div className="px-2 pb-10">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={nodes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5">
                        {fileManager.getRootId() && renderTree(null)}
                    </div>
                </SortableContext>

                <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                    {activeId ? (
                        <div className="flex items-center py-2 px-3 bg-white/10 backdrop-blur-xl rounded-xl text-xs text-white border border-white/20 shadow-2xl scale-105">
                            <FileCode className="w-4 h-4 mr-3 text-red-500" />
                            {nodes.find(n => n.id === activeId)?.name}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
      </div>
      
      <div className="p-4 border-t border-white/5 bg-black/40 flex items-center justify-between text-[9px] text-gray-600 font-black uppercase tracking-[0.2em]">
        <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span>Ready</span>
        </div>
        <Filter className="w-3 h-3 hover:text-white cursor-pointer transition-colors" />
      </div>
    </div>
  );
};
