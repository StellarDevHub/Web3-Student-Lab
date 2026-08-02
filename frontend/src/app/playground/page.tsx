'use client';

import { VirtualizedFileTree, type FileTreeNode } from '@/components/explorer/VirtualizedFileTree';
const PrSimulationPanel = dynamic(() => import('@/components/playground/PrSimulationPanel').then((mod) => mod.PrSimulationPanel), {
  ssr: false,
});
import { OfflineIndicator } from '@/components/storage/OfflineIndicator';
import {
    CompileOutputTerminal,
    type CompileLogEntry,
} from '@/components/terminal/CompileOutputTerminal';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { WithSkeleton } from '@/components/ui/WithSkeleton';
import { EditorSkeleton } from '@/components/ui/skeletons/EditorSkeleton';
import { useTutorial } from '@/contexts/TutorialContext';
import { CollaborationProvider } from '@/lib/collaboration/YjsProvider';
import type { CompileWorkerResponse } from '@/lib/compiler/compileTypes';
import { FilePresenceManager } from '@/lib/explorer/FilePresence';
import { DatabaseManager } from '@/lib/storage/DatabaseManager';
import { SyncManager } from '@/lib/storage/SyncManager';
import { Settings, X } from 'lucide-react';
import { DependencyUpdatePanel } from '@/components/playground/DependencyUpdatePanel';
import { AccessibilityAuditPanel } from '@/components/playground/AccessibilityAuditPanel';
import { ContractSearch } from '@/components/playground/ContractSearch';
import { useAccessibilityAudit } from '@/hooks/useAccessibilityAudit';
import { AssistantPanel } from '@/components/playground/AssistantPanel';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CodeEditor = dynamic(() => import('@/components/playground/CodeEditor').then((mod) => mod.CodeEditor), {
  ssr: false,
});

const DEFAULT_CARGO_TOML = `[package]
name = "soroban-contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "21.7.6"
soroban-auth = "21.0.0"
stellar-xdr = "21.2.0"
num-integer = "0.1.44"
num-traits = "0.2.17"
`;

const INITIAL_TREE: FileTreeNode[] = [
  {
    id: 'src',
    name: 'src',
    path: '/src',
    type: 'folder',
    children: [
      { id: 'lib-rs', name: 'lib.rs', path: '/src/lib.rs', type: 'file' },
      { id: 'file-notarization-rs', name: 'file_notarization.rs', path: '/src/file_notarization.rs', type: 'file' },
      { id: 'payment-gateway-rs', name: 'payment_gateway.rs', path: '/src/payment_gateway.rs', type: 'file' },
      { id: 'timestamping-rs', name: 'timestamping.rs', path: '/src/timestamping.rs', type: 'file' },
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
  const [compileLogs, setCompileLogs] = useState<CompileLogEntry[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [errorLog, setErrorLog] = useState('');
  const [sourceCode, setSourceCode] = useState<string>(`#![no_std]

use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(_env: Env) -> Symbol {
        Symbol::new(&_env, "hello")
    }
}`);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoComplete, setAutoComplete] = useState(true);
  const [vimMode, setVimMode] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [editorSettings, setEditorSettings] = useState({
    fontSize: 14,
    tabSize: 2,
    vimBindings: false,
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const { startTutorial } = useTutorial();
  const [treeData, setTreeData] = useState<FileTreeNode[]>(INITIAL_TREE);
  const [activeFilePath, setActiveFilePath] = useState('/src/contract.rs');
  const [provider] = useState(() => new CollaborationProvider('main-lab-session'));
  const [databaseManager] = useState(() => new DatabaseManager());
  const [syncManager] = useState(() => new SyncManager(databaseManager));
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'editor' | 'output' | 'prsim'>('editor');
  const workerRef = useRef<Worker | null>(null);

  const { result: auditResult, isPending: auditPending, runAudit } = useAccessibilityAudit(sourceCode, {
    debounceMs: 500,
  });

  useEffect(() => {
    const compileWorker = new Worker(new URL('../../lib/compiler/compile.worker.ts', import.meta.url), {
      type: 'module',
    });

    const handleWorkerMessage = (event: MessageEvent<CompileWorkerResponse>) => {
      const data = event.data;
      if (data.type === 'log') {
        setCompileLogs((prev) => [...prev, data.entry]);
        return;
      }
      if (data.type === 'complete') {
        setIsCompiling(false);
        if (!data.success) {
          setErrorLog(data.errors.join('\n') || 'Browser compile failed with unknown diagnostics.');
        } else {
          setErrorLog('');
        }
        if (!data.success && data.errors.length === 0) {
          setCompileLogs((prev) => [
            ...prev,
            {
              id: crypto.randomUUID?.() ?? `${Date.now()}-compile-failed`,
              level: 'error',
              timestamp: new Date().toLocaleTimeString(),
              message: 'Browser compile failed with unknown diagnostics.',
            },
          ]);
        }
      }
    };

    compileWorker.addEventListener('message', handleWorkerMessage);
    workerRef.current = compileWorker;

    return () => {
      compileWorker.removeEventListener('message', handleWorkerMessage);
      compileWorker.terminate();
      workerRef.current = null;
    };
  }, []);

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

  const handleCompile = useCallback(() => {
    if (isCompiling) return;
    const stamp = () => new Date().toLocaleTimeString();
    setCompileLogs([
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-compile-start`,
        level: 'info',
        timestamp: stamp(),
        message: `soroban contract build --file ${activeFilePath}`,
      },
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-compile-check`,
        level: 'info',
        timestamp: stamp(),
        message: 'Checking Rust target wasm32-unknown-unknown...',
      },
    ]);
    setIsCompiling(true);

    if (!workerRef.current) {
      setCompileLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? `${Date.now()}-compile-error`,
          level: 'error',
          timestamp: stamp(),
          message: 'Unable to start browser compiler worker.',
        },
      ]);
      setIsCompiling(false);
      return;
    }

    workerRef.current.postMessage({
      type: 'compile',
      source: sourceCode,
      filePath: activeFilePath,
    });
  }, [activeFilePath, isCompiling, sourceCode]);

  useEffect(() => {
    const handleShortcutCompile = () => {
      if (!isCompiling) {
        handleCompile();
      }
    };

    document.addEventListener('playground-compile', handleShortcutCompile as EventListener);
    return () => {
      document.removeEventListener('playground-compile', handleShortcutCompile as EventListener);
    };
  }, [handleCompile, isCompiling]);

  useEffect(() => {
    const restoreActiveFile = async () => {
      const stored = await databaseManager.getMetadata('playground:active-file');
      if (stored?.value) {
        setActiveFilePath(stored.value);
      }
    };
    restoreActiveFile();
  }, [databaseManager]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-black p-6 font-mono text-white md:p-12">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-12 flex items-end justify-between border-b border-white/10 pb-6" data-tour-step="playground-header">
          <div>
            <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
              Soroban <span className="text-red-500">Playground</span>
            </h1>
            <p className="text-xs tracking-widest text-gray-500 uppercase">
              Experimental Smart Contract Runtime v1.0.4
            </p>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <span className="animate-pulse text-[10px] font-bold tracking-widest text-green-500 uppercase">
              ● Network Active: Stellar Testnet
            </span>
            <button
              onClick={() => startTutorial('playground')}
              className="rounded border border-red-600/30 bg-red-600/10 px-4 py-2 text-[10px] font-black tracking-widest text-red-500 uppercase transition-colors hover:bg-red-600/20"
              aria-label="Start playground tutorial"
            >
              ? Tutorial
            </button>
          </div>
        </div>

        {/* Desktop PR Sim Tab */}
        <div className="hidden lg:flex mb-6 gap-1 rounded-xl border border-white/10 bg-zinc-950 p-1">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'editor'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Editor & Terminal
          </button>
          <button
            onClick={() => setActiveTab('prsim')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'prsim'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            PR Simulation
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden mb-6 border border-white/10 rounded-xl p-1 bg-zinc-950">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all min-h-[44px] flex items-center justify-center ${
              activeTab === 'editor'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab('output')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all min-h-[44px] flex items-center justify-center ${
              activeTab === 'output'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Output & Terminal
          </button>
          <button
            onClick={() => setActiveTab('prsim')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase rounded-lg transition-all min-h-[44px] flex items-center justify-center ${
              activeTab === 'prsim'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            PR Sim
          </button>
        </div>

        {/* PR Simulation Panel — standalone view */}
        {activeTab === 'prsim' && (
          <div className="lg:hidden flex-grow">
            <PrSimulationPanel className="h-full" />
          </div>
        )}

        <div className={`grid flex-grow grid-cols-1 gap-12 lg:grid-cols-2 ${activeTab === 'prsim' ? 'hidden lg:grid' : ''}`}>
          {/* Editor Placeholder */}
          <div className="relative flex min-h-[600px] flex-col rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl" data-tour-step="playground-editor">
            <div className="mb-6 flex items-center justify-between gap-2 border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <div className="h-3 w-3 rounded-full bg-zinc-700"></div>
                <div className="h-3 w-3 rounded-full bg-zinc-700"></div>
                <span className="ml-4 text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                  {activeFilePath}
                </span>
              </div>
              <div className="flex self-start sm:self-auto items-center gap-2 rounded-full border border-red-600/20 bg-red-600/10 px-3 py-1">
                <span className="text-[9px] font-black tracking-widest text-red-500 uppercase">
                  Collaborative Mode
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:border-red-500/40 hover:text-white"
                aria-label="Open editor settings"
                title="Editor settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4" data-tour-step="playground-file-tree">
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
                <CodeEditor
                  roomName="main-lab-session"
                  collaborationProvider={provider}
                  settings={editorSettings}
                  value={sourceCode}
                  onCodeChange={setSourceCode}
                />
              </WithSkeleton>
            </div>

            <button
              onClick={handleCompile}
              disabled={isCompiling}
              data-tour-step="playground-compile-btn"
              className={`mt-4 rounded-xl py-4 text-xs font-black tracking-[0.2em] uppercase transition-all ${
                isCompiling
                  ? 'cursor-not-allowed bg-zinc-800 text-gray-500'
                  : 'bg-red-600 text-white hover:bg-red-500 active:scale-[0.98]'
              }`}
            >
              {isCompiling ? 'Compiling Context...' : 'Execute Logic'}
            </button>
          </div>

          {/* Terminal Output or PR Simulation */}
          <div className="flex flex-col gap-6" data-tour-step="playground-output">
            {activeTab === 'prsim' ? (
              <PrSimulationPanel />
            ) : (
              <>
                <CompileOutputTerminal logs={compileLogs} isCompiling={isCompiling} />

                <TerminalPanel />

                <DependencyUpdatePanel cargoToml={DEFAULT_CARGO_TOML} />
                <AccessibilityAuditPanel
                  result={auditResult}
                  isPending={auditPending}
                  onRunAudit={runAudit}
                />

                <div className="rounded-3xl border border-white/5 bg-zinc-950 p-4 sm:p-8">
                  <h4 className="mb-4 text-[10px] font-black tracking-widest text-white uppercase">
                    Laboratory Notes
                  </h4>
                  <ContractSearch onSelect={setSelectedContract} />
                  <p className="text-[11px] leading-relaxed font-light text-gray-500">
                    This playground now includes the educational notarization and payment gateway modules.
                    Learners can inspect hash timestamping, escrowed payment processing, refunds, and
                    dispute resolution before deploying validated Soroban logic with the integrated CLI
                    tools in the <span className="text-red-500">Builder Tier</span> modules.
                  </p>
                </div>
              </>
            )}
            {/* AI Assistant panel */}
            <AssistantPanel
              getCode={() => sourceCode}
              errorLog={errorLog}
            />
          </div>
        </div>
      </div>
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-settings-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2
                id="editor-settings-title"
                className="text-sm font-black tracking-widest text-white uppercase"
              >
                Editor Settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white"
                aria-label="Close editor settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-6">
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-bold tracking-widest text-zinc-400 uppercase">
                  Font Size <span className="text-white">{editorSettings.fontSize}px</span>
                </span>
                <input
                  type="range"
                  min={12}
                  max={22}
                  step={1}
                  value={editorSettings.fontSize}
                  onChange={(event) =>
                    setEditorSettings((prev) => ({
                      ...prev,
                      fontSize: Number(event.target.value),
                    }))
                  }
                  className="h-2 w-full cursor-pointer accent-red-600"
                />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-bold tracking-widest text-zinc-400 uppercase">
                  Tab Size <span className="text-white">{editorSettings.tabSize}</span>
                </span>
                <input
                  type="range"
                  min={2}
                  max={8}
                  step={2}
                  value={editorSettings.tabSize}
                  onChange={(event) =>
                    setEditorSettings((prev) => ({
                      ...prev,
                      tabSize: Number(event.target.value),
                    }))
                  }
                  className="h-2 w-full cursor-pointer accent-red-600"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="text-xs font-bold tracking-widest text-zinc-300 uppercase">
                  Vim Bindings
                </span>
                <input
                  type="checkbox"
                  checked={editorSettings.vimBindings}
                  onChange={(event) =>
                    setEditorSettings((prev) => ({
                      ...prev,
                      vimBindings: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 accent-red-600"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
