"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { VariableSizeList as List } from "react-window";
import { PresenceIndicator } from "@/components/explorer/PresenceIndicator";
import { FilePresenceManager } from "@/lib/explorer/FilePresence";

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
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
    if (node.type === "folder" && manager.isFolderExpanded(node.path) && node.children?.length) {
      flat.push(...flattenTree(node.children, manager, depth + 1));
    }
  });
  return flat;
}

export function VirtualizedFileTree({
  nodes,
  activeFilePath,
  height = 520,
  filePresenceManager,
  onSelectFile,
  onMoveFile,
}: VirtualizedFileTreeProps) {
  const listRef = useRef<List>(null);
  const [tick, setTick] = useState(0);

  const flatNodes = useMemo(
    () => flattenTree(nodes, filePresenceManager),
    [nodes, filePresenceManager, tick],
  );

  useEffect(() => {
    const awareness = filePresenceManager.getAwareness();
    if (!awareness) return;
    const onAwarenessChange = () => setTick((value) => value + 1);
    awareness.on("change", onAwarenessChange);
    return () => {
      awareness.off("change", onAwarenessChange);
    };
  }, [filePresenceManager]);

  const getItemSize = (index: number) => {
    const current = flatNodes[index];
    if (!current) return FILE_HEIGHT;
    return current.node.type === "folder" ? FOLDER_HEIGHT : FILE_HEIGHT;
  };

  const handleToggleFolder = (path: string) => {
    const next = !filePresenceManager.isFolderExpanded(path);
    filePresenceManager.setFolderExpanded(path, next);
    listRef.current?.resetAfterIndex(0);
    setTick((value) => value + 1);
  };

  const renderRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = flatNodes[index];
    if (!item) return null;

    const { node, depth } = item;
    const isActive = node.path === activeFilePath;
    const users = node.type === "file" ? filePresenceManager.getUsersForFile(node.path) : [];

    return (
      <div
        style={style}
        className={`flex items-center border-b border-white/5 px-3 text-xs transition-colors ${
          isActive ? "bg-red-600/20 text-red-300" : "text-zinc-300 hover:bg-zinc-900"
        }`}
        draggable={node.type === "file"}
        onDragStart={(event) => {
          if (node.type !== "file") return;
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (!onMoveFile || node.type !== "folder") return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!onMoveFile || node.type !== "folder") return;
          event.preventDefault();
          const sourcePath = event.dataTransfer.getData("text/plain");
          if (!sourcePath || sourcePath === node.path) return;
          onMoveFile(sourcePath, node.path);
        }}
      >
        <div style={{ marginLeft: depth * INDENT_PX }} className="flex w-full items-center gap-2">
          {node.type === "folder" ? (
            <button
              className="font-semibold uppercase tracking-wide text-zinc-200"
              onClick={() => handleToggleFolder(node.path)}
            >
              {filePresenceManager.isFolderExpanded(node.path) ? "▾" : "▸"} {node.name}
            </button>
          ) : (
            <button
              className="flex items-center text-left text-zinc-300"
              onClick={() => onSelectFile(node.path)}
            >
              <span className="mr-1.5 text-zinc-500">•</span>
              {node.name}
            </button>
          )}
          {node.type === "file" && <PresenceIndicator users={users} />}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60">
      <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
        project explorer
      </div>
      <List
        ref={listRef}
        height={height}
        itemCount={flatNodes.length}
        itemSize={getItemSize}
        width="100%"
        overscanCount={8}
      >
        {renderRow}
      </List>
    </div>
  );
}
