import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  FileCode,
  Hash,
  Database,
  Code2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileNode } from '../../lib/explorer/FileManager';
import { cn } from '../../lib/utils';
import { ContextMenu } from './ContextMenu';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAction: (action: string, id: string) => void;
  isSelected: boolean;
  childrenNodes?: React.ReactNode;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth,
  onToggle,
  onSelect,
  onAction,
  isSelected,
  childrenNodes,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${depth * 1.1}rem`,
    opacity: isDragging ? 0.3 : 1,
  };

  const Icon = node.type === 'folder' ? (node.isOpen ? ChevronDown : ChevronRight) : null;

  const getFileIcon = (name: string) => {
    if (name.endsWith('.rs')) return <Code2 className="h-3.5 w-3.5 text-orange-400" />;
    if (name.endsWith('.json')) return <Database className="h-3.5 w-3.5 text-sky-400" />;
    if (name.endsWith('.toml')) return <Hash className="h-3.5 w-3.5 text-emerald-400" />;
    return <FileCode className="h-3.5 w-3.5 text-gray-400" />;
  };

  const TypeIcon =
    node.type === 'folder' ? (
      <Folder
        className={cn(
          'h-3.5 w-3.5',
          node.isOpen ? 'fill-amber-300/20 text-amber-300' : 'text-amber-400'
        )}
      />
    ) : (
      getFileIcon(node.name)
    );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(
          'group flex cursor-pointer items-center rounded-lg border border-transparent px-2 py-1.5 text-[13px] transition-all',
          isSelected
            ? 'border-red-500/20 bg-red-500/10 text-white shadow-[0_0_15px_rgba(239,68,68,0.05)]'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        )}
        onClick={() => {
          if (node.type === 'folder') onToggle(node.id);
          onSelect(node.id);
        }}
        {...attributes}
        {...listeners}
      >
        <div className="mr-1 flex w-4 items-center justify-center">
          {Icon && (
            <Icon
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                node.isOpen && 'rotate-0',
                !node.isOpen && '-rotate-0'
              )}
            />
          )}
        </div>

        <div className="mr-2.5 flex items-center justify-center">{TypeIcon}</div>

        <span className="flex-grow truncate font-medium tracking-tight select-none">
          {node.name}
        </span>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuPos({ x: e.clientX, y: e.clientY });
            }}
            className="rounded-md p-1 transition-colors hover:bg-white/10"
          >
            <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {node.type === 'folder' && node.isOpen && childrenNodes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-2 flex flex-col border-l border-white/5 py-1">{childrenNodes}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          type={node.type}
          onClose={() => setMenuPos(null)}
          onAction={(action) => onAction(action, node.id)}
        />
      )}
    </div>
  );
};
