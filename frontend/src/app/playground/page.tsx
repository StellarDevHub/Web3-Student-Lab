'use client';

import { CodeEditor } from '@/components/playground/CodeEditor';
import { VirtualizedFileTree, type FileTreeNode } from '@/components/explorer/VirtualizedFileTree';
import { FilePresenceManager } from '@/lib/explorer/FilePresence';
import { CollaborationProvider } from '@/lib/collaboration/YjsProvider';
import { OfflineIndicator } from '@/components/storage/OfflineIndicator';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { DatabaseManager } from '@/lib/storage/DatabaseManager';
import { SyncManager } from '@/lib/storage/SyncManager';
import { useState, useEffect, useMemo } from 'react';
import { WithSkeleton } from '@/components/ui/WithSkeleton';
import { EditorSkeleton } from '@/components/ui/skeletons/EditorSkeleton';

const INITIAL_TREE: FileTreeNode[] = [
  {
    id: 'src',
    name: 'src',
    path: '/src',
    type: 'folder',
    children: [
      { id: 'lib-rs', name: 'lib.rs', path: '/src/lib.rs', type: 'file' },
      { id: 'contract-rs', name: 'contract.rs', path: '/src/contract.rs', type: 'file' },
      { id: 'types-rs', name: 'types.rs', path: '/src/types.rs', type: 'file' },
    ],
  },
  {
    id: 'tests',
    name: 'tests',
    path: '/tests',
    type: 'folder',
    children: [
      {
        id: 'contract-test-rs',
        name: 'contract.test.rs',
        path: '/tests/contract.test.rs',
        type: 'file',
      },
    ],
  },
  { id: 'cargo-toml', name: 'Cargo.toml', path: '/Cargo.toml', type: 'file' },
];

function moveFileNode(
  nodes: FileTreeNode[],
  sourcePath: string,
  targetFolderPath: string
): FileTreeNode[] {
  let movedNode: FileTreeNode | null = null;
  let nextTree = structuredClone(nodes) as FileTreeNode[];

  const removeNode = (items: FileTreeNode[]): FileTreeNode[] =>
    items
      .map((item) => {
        if (item.path === sourcePath && item.type === 'file') {
          movedNode = item;
          return null;
        }
        if (item.children?.length) {
          item.children = removeNode(item.children);
        }
        return item;
      })
      .filter(Boolean) as FileTreeNode[];

  const insertNode = (items: FileTreeNode[]): FileTreeNode[] =>
    items.map((item) => {
      if (item.path === targetFolderPath && item.type === 'folder' && movedNode) {
        item.children = [...(item.children ?? []), movedNode];
      } else if (item.children?.length) {
        item.children = insertNode(item.children);
      }
      return item;
    });

  nextTree = removeNode(nextTree);
  if (!movedNode) {
    return nodes;
  }
  return insertNode(nextTree);
}

export default function PlaygroundPage() {
  const [output, setOutput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [treeData, setTreeData] = useState<FileTreeNode[]>(INITIAL_TREE);
  const [activeFilePath, setActiveFilePath] = useState('/src/contract.rs');
  const [provider] = useState(() => new CollaborationProvider('main-lab-session'));
  const [databaseManager] = useState(() => new DatabaseManager());
  const [syncManager] = useState(() => new SyncManager(databaseManager));
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      provider.destroy();
    };
  }, [provider]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const filePresenceManager = useMemo(() => {
    const folderStateMap = provider.doc.getMap<boolean>('explorer:folder-state');
    const manager = new FilePresenceManager(
      provider.awareness,
      folderStateMap,
      provider.awareness.clientID
    );
    manager.hydrateFolderStateFromStorage();
    manager.setActiveFile(activeFilePath);
    return manager;
  }, [provider, activeFilePath]);

  useEffect(() => {
    filePresenceManager.setActiveFile(activeFilePath);
  }, [activeFilePath, filePresenceManager]);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((state) => setSyncState(state));
    return unsubscribe;
  }, [syncManager]);

  useEffect(() => {
    const setupPersistence = async () => {
      await syncManager.restoreYDoc(provider.doc, 'playground-main-lab-session');
      const cleanup = syncManager.attachYDocPersistence(
        provider.doc,
        'playground-main-lab-session'
      );
      setPendingCount(syncManager.getPendingChanges().length);
      return cleanup;
    };

    let cleanupFn: null | (() => Promise<void>) = null;
    setupPersistence().then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [provider.doc, syncManager]);

  useEffect(() => {
    const persistActiveFile = async () => {
      await databaseManager.setMetadata('playground:active-file', activeFilePath);
    };
    persistActiveFile();
  }, [activeFilePath, databaseManager]);

  useEffect(() => {
    const restoreActiveFile = async () => {
      const stored = await databaseManager.getMetadata('playground:active-file');
      if (stored?.value) {
        setActiveFilePath(stored.value);
      }
    };
    restoreActiveFile();
  }, [databaseManager]);

  const handleCompile = () => {
    setIsCompiling(true);
    // Simulate compilation delay
    setTimeout(() => {
      setOutput(
        `✅ Compilation successful!\n📦 WASM size: 4.2KB\n🗂 Active file: ${activeFilePath}\n🚀 Contract ready for simulation.`
      );
      setIsCompiling(false);
    }, 1500);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-black p-6 font-mono text-white md:p-12">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-12 flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
              Soroban <span className="text-red-500">Playground</span>
            </h1>
            <p className="text-xs tracking-widest text-gray-500 uppercase">
              Experimental Smart Contract Runtime v1.0.4
            </p>
          </div>
          <div className="hidden text-right md:block">
            <span className="animate-pulse text-[10px] font-bold tracking-widest text-green-500 uppercase">
              ● Network Active: Stellar Testnet
            </span>
          </div>
        </div>

        <div className="grid flex-grow grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Editor Placeholder */}
          <div className="relative flex min-h-[600px] flex-col rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-2 border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <div className="h-3 w-3 rounded-full bg-zinc-700"></div>
                <div className="h-3 w-3 rounded-full bg-zinc-700"></div>
                <span className="ml-4 text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                  {activeFilePath}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-red-600/20 bg-red-600/10 px-3 py-1">
                <span className="text-[9px] font-black tracking-widest text-red-500 uppercase">
                  Collaborative Mode
                </span>
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-2">
                <OfflineIndicator
                  isOnline={isOnline}
                  syncState={syncState}
                  pendingCount={pendingCount}
                  onManualSync={async () => {
                    await syncManager.syncPendingUploads(async () => Promise.resolve());
                    setPendingCount(syncManager.getPendingChanges().length);
                  }}
                />
              </div>
              <VirtualizedFileTree
                nodes={treeData}
                activeFilePath={activeFilePath}
                filePresenceManager={filePresenceManager}
                onSelectFile={setActiveFilePath}
                onMoveFile={(sourcePath, targetFolderPath) => {
                  setTreeData((prev) => moveFileNode(prev, sourcePath, targetFolderPath));
                }}
              />
            </div>

            <div className="relative flex flex-grow flex-col overflow-hidden rounded-xl border border-white/5">
              <WithSkeleton isLoading={isInitializing} skeleton={<EditorSkeleton />}>
                <CodeEditor roomName="main-lab-session" collaborationProvider={provider} />
              </WithSkeleton>
            </div>

            <button
              onClick={handleCompile}
              disabled={isCompiling}
              className={`mt-4 rounded-xl py-4 text-xs font-black tracking-[0.2em] uppercase transition-all ${
                isCompiling
                  ? 'cursor-not-allowed bg-zinc-800 text-gray-500'
                  : 'bg-red-600 text-white hover:bg-red-500 active:scale-[0.98]'
              }`}
            >
              {isCompiling ? 'Compiling Context...' : 'Execute Logic'}
            </button>
          </div>

          {/* Terminal Output */}
          <div className="flex flex-col gap-6">
            <div className="group relative flex-grow overflow-hidden rounded-3xl border border-white/10 bg-black p-8 shadow-inner">
              <div className="absolute top-0 left-0 h-1 w-full bg-red-600/30"></div>
              <h3 className="mb-6 text-[10px] font-black tracking-widest text-gray-600 uppercase">
                Execution_Output
              </h3>
              <pre className="font-mono text-xs leading-loose whitespace-pre-wrap text-red-500/80">
                {output || '> Initializing environment...\n> Awaiting input signal...'}
              </pre>
              {isCompiling && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all">
                  <div className="flex flex-col items-center">
                    <div className="mb-4 h-1 w-12 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full w-1/2 animate-[loading_1s_infinite] bg-red-600"></div>
                    </div>
                    <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase">
                      Processing WASM Bytecode
                    </span>
                  </div>
                </div>
              )}
            </div>

            <TerminalPanel />

            <div className="rounded-3xl border border-white/5 bg-zinc-950 p-8">
              <h4 className="mb-4 text-[10px] font-black tracking-widest text-white uppercase">
                Laboratory Notes
              </h4>
              <p className="text-[11px] leading-relaxed font-light text-gray-500">
                This playground provides a{' '}
                <span className="text-white">real-time transpilation</span> environment for Soroban
                logic. Validated code can be deployed to the Stellar testnet via the integrated CLI
                tools in the <span className="text-red-500">Builder Tier</span> modules.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
