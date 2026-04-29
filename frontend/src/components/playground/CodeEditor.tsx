import Editor, { OnMount } from "@monaco-editor/react";
import React, { useEffect, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import { 
  Activity, 
  Terminal, 
  Code2, 
  ChevronRight, 
  Users, 
  Wifi, 
  AlertCircle,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocketStatus } from "../../lib/collaboration/WebSocketManager";
import { CollaborationProvider } from "../../lib/collaboration/YjsProvider";
import { LSPClient } from "../../lib/lsp/LSPClient";
import { DiagnosticsManager } from "../../lib/lsp/DiagnosticsManager";
import { StateManager } from "../../lib/debugger/StateManager";
import { TimeTravelDebugger } from "../debugger/TimeTravelDebugger";
import { cn } from "../../lib/utils";

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
  const [provider] = useState(() => new CollaborationProvider(roomName));
  const [stateManager] = useState(() => new StateManager(provider.doc));
  const [snapshots, setSnapshots] = useState(stateManager.getHistory());
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [errorCount, setErrorCount] = useState(0);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const lspClientRef = useRef<LSPClient | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_LSP_WS_URL || 'ws://localhost:3001/rust';
    lspClientRef.current = new LSPClient(wsUrl, 'rust');
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

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    const type = provider.doc.getText("monaco");
    bindingRef.current = new MonacoBinding(
      type,
      editor.getModel()!,
      new Set([editor]),
      provider.awareness,
    );

    const diagnosticsManager = new DiagnosticsManager(editor);
    
    editor.onDidChangeModelContent(() => {
        stateManager.trackChange('Code update');
        setSnapshots([...stateManager.getHistory()]);
    });

    editor.onDidChangeCursorPosition((e) => {
        setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    // Listen for diagnostics to update error count
    monaco.editor.onDidChangeMarkers(() => {
        const markers = monaco.editor.getModelMarkers({ resource: editor.getModel()?.uri });
        setErrorCount(markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length);
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
    <div className="group relative flex flex-grow flex-col h-full overflow-hidden bg-[#09090b]">
      {/* Premium Breadcrumbs */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-white/5 bg-black/40 text-[10px] font-bold text-gray-500 uppercase tracking-widest overflow-x-auto no-scrollbar">
        <FileText className="w-3.5 h-3.5 text-gray-400" />
        <span>Web3-Student-Lab</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-300">contracts</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-red-500">lib.rs</span>
        <div className="flex-grow" />
        <div className="flex items-center gap-4 text-gray-600">
            <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                <span>3 Active</span>
            </div>
            <div className="flex items-center gap-1.5">
                <Wifi className={cn("w-3 h-3", status === "connected" ? "text-emerald-500" : "text-red-500")} />
                <span>{status}</span>
            </div>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-grow relative">
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
      </div>

      {/* Time-Travel Debugger Integration */}
      <TimeTravelDebugger 
        snapshots={snapshots} 
        onRestore={(id) => stateManager.revertTo(id)} 
      />

      {/* Premium Status Bar */}
      <div className="flex items-center justify-between px-6 py-1.5 bg-black/80 backdrop-blur-xl border-t border-white/5 text-[9px] font-black uppercase tracking-[0.15em] text-gray-500 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                <span className="text-gray-300">LSP: RUST-ANALYZER</span>
            </div>
            <div className="flex items-center gap-2">
                <AlertCircle className={cn("w-3 h-3", errorCount > 0 ? "text-red-500" : "text-gray-600")} />
                <span className={cn(errorCount > 0 ? "text-red-500" : "text-gray-500")}>
                    {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <Terminal className="w-3 h-3 text-emerald-500" />
                <span>Runtime: Stable</span>
            </div>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span>Spaces: 4</span>
                <span>Rust</span>
            </div>
            <div className="bg-red-500 text-white px-2 py-0.5 rounded font-mono text-[10px]">
                LN {cursorPos.line}, COL {cursorPos.col}
            </div>
        </div>
      </div>
    </div>
  );
};
