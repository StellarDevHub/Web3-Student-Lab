'use client';

import { PresenceIndicator } from '@/components/explorer/PresenceIndicator';
import { FilePresenceManager } from '@/lib/explorer/FilePresence';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { List, ListImperativeAPI } from 'react-window';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

interface FlatNode {
  node: FileTreeNode;
  depth: number;
}

interface VirtualizedFileTreeProps {
  nodes: FileTreeNode[];
  activeFilePath?: string;
  height?: number;
  filePresenceManager: FilePresenceManager;
  onSelectFile: (filePath: string) => void;
  onMoveFile?: (sourcePath: string, targetFolderPath: string) => void;
}

const INDENT_PX = 14;
const FILE_HEIGHT = 36;
const FOLDER_HEIGHT = 40;

function flattenTree(nodes: FileTreeNode[], manager: FilePresenceManager, depth = 0): FlatNode[] {
  const flat: FlatNode[] = [];
  nodes.forEach((node) => {
    flat.push({ node, depth });
    if (node.type === 'folder' && manager.isFolderExpanded(node.path) && node.children?.length) {
      flat.push(...flattenTree(node.children, manager, depth + 1));
    }
  });
  return flat;
}

function getFolders(nodes: FileTreeNode[]): { name: string; path: string }[] {
  const folders: { name: string; path: string }[] = [];
  const traverse = (items: FileTreeNode[]) => {
    items.forEach((item) => {
      if (item.type === 'folder') {
        folders.push({ name: item.name, path: item.path });
        if (item.children) {
          traverse(item.children);
        }
      }
    });
  };
  traverse(nodes);
  return folders;
}

interface FileTreeRowCustomProps {
  flatNodes: FlatNode[];
  activeFilePath?: string;
  filePresenceManager: FilePresenceManager;
  onSelectFile: (filePath: string) => void;
  onMoveFile?: (sourcePath: string, targetFolderPath: string) => void;
  onToggleFolder: (path: string) => void;
  folders: { name: string; path: string }[];
}

interface FileTreeRowProps extends FileTreeRowCustomProps {
  index: number;
  style: React.CSSProperties;
}

function FileTreeRow({
  index,
  style,
  flatNodes,
  activeFilePath,
  filePresenceManager,
  onSelectFile,
  onMoveFile,
  onToggleFolder,
  folders,
}: FileTreeRowProps) {
  const item = flatNodes[index];
  if (!item) return null;

  const { node, depth } = item;
  const isActive = node.path === activeFilePath;
  const users = node.type === 'file' ? filePresenceManager.getUsersForFile(node.path) : [];

  return (
    <div
      style={style}
      className={`flex items-center border-b border-white/5 px-3 text-xs transition-colors ${
        isActive ? 'bg-red-600/20 text-red-300' : 'text-zinc-300 hover:bg-zinc-900'
      }`}
      draggable={node.type === 'file'}
      onDragStart={(event) => {
        if (node.type !== 'file') return;
        event.dataTransfer.setData('text/plain', node.path);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (!onMoveFile || node.type !== 'folder') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        if (!onMoveFile || node.type !== 'folder') return;
        event.preventDefault();
        const sourcePath = event.dataTransfer.getData('text/plain');
        if (!sourcePath || sourcePath === node.path) return;
        onMoveFile(sourcePath, node.path);
      }}
    >
      <div style={{ marginLeft: depth * INDENT_PX }} className="flex w-full items-center gap-2">
        {node.type === 'folder' ? (
          <button
            className="font-semibold tracking-wide text-zinc-200 uppercase min-h-[44px] md:min-h-0 flex items-center"
            onClick={() => onToggleFolder(node.path)}
          >
            {filePresenceManager.isFolderExpanded(node.path) ? '▾' : '▸'} {node.name}
          </button>
        ) : (
          <button
            className="flex items-center text-left text-zinc-300 min-h-[44px] md:min-h-0 py-2 md:py-0"
            onClick={() => onSelectFile(node.path)}
          >
            <span className="mr-1.5 text-zinc-500">•</span>
            {node.name}
          </button>
        )}
        {node.type === 'file' && <PresenceIndicator users={users} />}
        {node.type === 'file' && onMoveFile && (
          <select
            aria-label={`Move ${node.name} to folder`}
            className="ml-auto rounded border border-white/15 bg-zinc-950 px-2 py-1 text-[10px] md:text-[9px] text-zinc-400 focus:outline-none focus:ring-1 focus:ring-red-500 min-h-[44px] md:min-h-0"
            value=""
            onChange={(e) => {
              const targetFolder = e.target.value;
              if (targetFolder) {
                onMoveFile(node.path, targetFolder);
              }
            }}
          >
            <option value="" disabled>Move</option>
            {folders.filter(f => !node.path.startsWith(f.path + '/')).map(f => (
              <option key={f.path} value={f.path}>to {f.name}/</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export function VirtualizedFileTree({
  nodes,
  activeFilePath,
  height = 520,
  filePresenceManager,
  onSelectFile,
  onMoveFile,
}: VirtualizedFileTreeProps) {
  const listRef = useRef<ListImperativeAPI>(null);
  const [tick, setTick] = useState(0);

  const flatNodes = useMemo(
    () => flattenTree(nodes, filePresenceManager),
    [nodes, filePresenceManager, tick]
  );

  const folders = useMemo(() => getFolders(nodes), [nodes]);

  useEffect(() => {
    const awareness = filePresenceManager.getAwareness();
    if (!awareness) return;
    const onAwarenessChange = () => setTick((value) => value + 1);
    awareness.on('change', onAwarenessChange);
    return () => {
      awareness.off('change', onAwarenessChange);
    };
  }, [filePresenceManager]);

  const getItemSize = useCallback(
    (index: number) => {
      const current = flatNodes[index];
      if (!current) return FILE_HEIGHT;
      return current.node.type === 'folder' ? FOLDER_HEIGHT : FILE_HEIGHT;
    },
    [flatNodes]
  );

  const handleToggleFolder = useCallback(
    (path: string) => {
      const next = !filePresenceManager.isFolderExpanded(path);
      filePresenceManager.setFolderExpanded(path, next);
      setTick((value) => value + 1);
    },
    [filePresenceManager]
  );

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60">
      <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase">
        project explorer
      </div>
      <List<FileTreeRowCustomProps>
        listRef={listRef}
        rowCount={flatNodes.length}
        rowHeight={getItemSize}
        overscanCount={8}
        style={{ height, width: '100%' }}
        rowComponent={FileTreeRow}
        rowProps={{
          flatNodes,
          activeFilePath,
          filePresenceManager,
          onSelectFile,
          onMoveFile,
          onToggleFolder: handleToggleFolder,
          folders,
        }}
      />
    </div>
  );
}
