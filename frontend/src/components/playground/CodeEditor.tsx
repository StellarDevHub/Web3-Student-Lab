import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs uppercase tracking-widest">Initializing Editor...</p>
      </div>
    </div>
  ),
});
import type { editor } from "monaco-editor";
import React, { useEffect, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import { CursorManager } from "@/components/cursor";
import { TimeTravelDebugger } from "@/components/debugger/TimeTravelDebugger";
import { useAwareness } from "@/hooks/useCanvasCollaboration";
import { useWebSocketStatus } from "@/lib/collaboration/WebSocketManager";
import { CollaborationProvider } from "@/lib/collaboration/YjsProvider";
import { StateManager } from "@/lib/debugger/StateManager";
import { DiagnosticsManager } from "@/lib/lsp/DiagnosticsManager";
import { LSPClient } from "@/lib/lsp/LSPClient";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronRight,
  FileText,
  Terminal,
  Users,
  Wifi,
} from "lucide-react";

interface CodeEditorProps {
  roomName: string;
  mobileMode?: boolean;
  collaborationProvider?: CollaborationProvider;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  mobileMode = false,
  roomName,
  collaborationProvider,
}) => {
  const [provider] = useState(
    () => collaborationProvider ?? new CollaborationProvider(roomName),
  );
  const shouldDestroyProvider = !collaborationProvider;
  const [stateManager] = useState(() => new StateManager(provider.doc));
  const [snapshots, setSnapshots] = useState(stateManager.getHistory());
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [errorCount, setErrorCount] = useState(0);
  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const lspClientRef = useRef<LSPClient | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_LSP_WS_URL || "ws://localhost:3001/rust";
    lspClientRef.current = new LSPClient(wsUrl, "rust");
    lspClientRef.current.connect();

    return () => {
      if (shouldDestroyProvider) {
        provider.destroy();
      }
      bindingRef.current?.destroy();
      lspClientRef.current?.disconnect();
    };
  }, [provider, shouldDestroyProvider]);

  const status = useWebSocketStatus(provider);
  const remoteUsers = useAwareness(provider.awareness);

  const handleEditorDidMount: OnMount = (mountedEditor, monaco) => {
    setEditorInstance(mountedEditor);

    const type = provider.doc.getText("monaco");
    bindingRef.current = new MonacoBinding(
      type,
      mountedEditor.getModel()!,
      new Set([mountedEditor]),
      provider.awareness,
    );

    const diagnosticsManager = new DiagnosticsManager(mountedEditor);
    void diagnosticsManager;

    mountedEditor.onDidChangeModelContent(() => {
      stateManager.trackChange("Code update");
      setSnapshots([...stateManager.getHistory()]);
    });

    mountedEditor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    monaco.editor.onDidChangeMarkers(() => {
      const markers = monaco.editor.getModelMarkers({
        resource: mountedEditor.getModel()?.uri,
      });
      setErrorCount(
        markers.filter((m) => m.severity === monaco.MarkerSeverity.Error).length,
      );
    });

    monaco.editor.defineTheme("web3-lab-premium", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "636e7b", fontStyle: "italic" },
        { token: "keyword", foreground: "ff7b72", fontStyle: "bold" },
        { token: "string", foreground: "a5d6ff" },
        { token: "variable", foreground: "ffa657" },
        { token: "type", foreground: "79c0ff" },
        { token: "function", foreground: "d2a8ff" },
      ],
      colors: {
        "editor.background": "#09090b",
        "editor.lineHighlightBackground": "#ffffff05",
        "editorCursor.foreground": "#ef4444",
        "editor.selectionBackground": "#ef444422",
        "editorIndentGuide.activeBackground": "#ffffff20",
        "editorLineNumber.foreground": "#4b5563",
        "editorLineNumber.activeForeground": "#f3f4f6",
      },
    });

    monaco.editor.setTheme("web3-lab-premium");
  };

  return (
    <div
      ref={containerRef}
      className="group relative flex h-full flex-grow flex-col overflow-hidden bg-[#09090b]"
    >
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/5 bg-black/40 px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 no-scrollbar">
        <FileText className="h-3.5 w-3.5 text-gray-400" />
        <span>Web3-Student-Lab</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-300">contracts</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-red-500">lib.rs</span>
        <div className="flex-grow" />
        <div className="flex items-center gap-4 text-gray-600">
          <div className="flex -space-x-2">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full border border-black text-[8px] font-bold text-white"
              style={{ backgroundColor: provider.localUser.color }}
              title={`You (${provider.localUser.name})`}
            >
              {provider.localUser.name.charAt(0)}
            </div>
            {remoteUsers.map((user) => (
              <div
                key={user.clientId}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-black text-[8px] font-bold text-white"
                style={{ backgroundColor: user.color }}
                title={user.name}
              >
                {user.name.charAt(0)}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            <span>{remoteUsers.length + 1} Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi
              className={cn(
                "h-3 w-3",
                status === "connected" ? "text-emerald-500" : "text-red-500",
              )}
            />
            <span>{status}</span>
          </div>
        </div>
      </div>

      <div className="relative flex-grow">
        <Editor
          height="100%"
          defaultLanguage="rust"
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: mobileMode ? 12 : 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            theme: "web3-lab-premium",
            automaticLayout: true,
            padding: { top: mobileMode ? 44 : 24 },
            smoothScrolling: true,
            cursorBlinking: "expand",
            cursorSmoothCaretAnimation: "on",
            renderLineHighlight: "all",
            scrollbar: {
              vertical: "visible",
              horizontal: "visible",
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />

        {editorInstance && provider.awareness && (
          <CursorManager
            editor={editorInstance}
            awareness={provider.awareness}
            containerRef={containerRef}
          />
        )}
      </div>

      <TimeTravelDebugger
        snapshots={snapshots}
        onRestore={(id) => stateManager.revertTo(id)}
      />

      <div className="flex items-center justify-between border-t border-white/5 bg-black/80 px-6 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-gray-500 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span className="text-gray-300">LSP: RUST-ANALYZER</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle
              className={cn(
                "h-3 w-3",
                errorCount > 0 ? "text-red-500" : "text-gray-600",
              )}
            />
            <span className={cn(errorCount > 0 ? "text-red-500" : "text-gray-500")}>
              {errorCount} {errorCount === 1 ? "Error" : "Errors"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Terminal className="h-3 w-3 text-emerald-500" />
            <span>Runtime: Stable</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <span>UTF-8</span>
            <span>Spaces: 4</span>
            <span>Rust</span>
          </div>
          <div className="rounded bg-red-500 px-2 py-0.5 font-mono text-[10px] text-white">
            LN {cursorPos.line}, COL {cursorPos.col}
          </div>
        </div>
      </div>
    </div>
  );
};
