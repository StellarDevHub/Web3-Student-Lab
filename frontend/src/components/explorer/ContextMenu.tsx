import React, { useEffect, useRef } from 'react';
import { Edit2, Trash2, Copy, FolderPlus, FilePlus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  type: 'file' | 'folder';
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onAction, type }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const items = [
    { id: 'rename', label: 'Rename', icon: Edit2, shortcut: 'F2' },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, shortcut: '⌘D' },
    ...(type === 'folder'
      ? [
          { id: 'new-file', label: 'New File', icon: FilePlus },
          { id: 'new-folder', label: 'New Folder', icon: FolderPlus },
        ]
      : []),
    { id: 'separator', type: 'separator' },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      className: 'text-rose-500 hover:bg-rose-500/10',
      shortcut: '⌫',
    },
  ];

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed z-[1000] w-56 rounded-2xl border border-white/10 bg-gray-900/95 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      style={{ top: y, left: x }}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={`sep-${index}`} className="mx-2 my-1.5 h-px bg-white/5" />;
        }

        const Icon = item.icon as React.ElementType;

        return (
          <button
            key={item.id}
            onClick={() => {
              onAction(item.id!);
              onClose();
            }}
            className={cn(
              'group flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium transition-all',
              item.className || 'text-gray-300 hover:bg-white/5 hover:text-white'
            )}
          >
            <div className="flex items-center gap-3">
              {Icon && (
                <Icon className="h-4 w-4 opacity-50 transition-opacity group-hover:opacity-100" />
              )}
              <span>{item.label}</span>
            </div>
            {'shortcut' in item && item.shortcut && (
              <span className="font-mono text-[10px] tracking-tighter text-gray-600 group-hover:text-gray-400">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </motion.div>
  );
};
