import Editor, { OnMount } from "@monaco-editor/react";
import React, { useEffect, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import { useWebSocketStatus } from "../../lib/collaboration/WebSocketManager";
import { CollaborationProvider } from "../../lib/collaboration/YjsProvider";

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
  const bindingRef = useRef<MonacoBinding | null>(null);

  useEffect(() => {
    return () => {
      if (shouldDestroyProvider) {
        provider.destroy();
      }
      bindingRef.current?.destroy();
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

    // Custom theme for Monaco to match the app aesthetic
    monaco.editor.defineTheme("web3-lab-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "666666", fontStyle: "italic" },
        { token: "keyword", foreground: "ef4444", fontStyle: "bold" },
        { token: "string", foreground: "10b981" },
      ],
      colors: {
        "editor.background": "#09090b",
        "editor.lineHighlightBackground": "#18181b",
        "editorCursor.foreground": "#ef4444",
      },
    });

    monaco.editor.setTheme("web3-lab-dark");
  };

  return (
    <div className="group relative flex flex-grow flex-col">
      <div className="absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-2">
        <div className="flex -space-x-2">
          {/* We could map over awareness states here to show avatars */}
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-red-500 text-[8px] font-bold">
            ME
          </div>
        </div>
        <div
          className={`flex items-center gap-2 rounded border border-white/10 bg-black/50 px-2 py-1 text-[9px] font-bold uppercase tracking-tighter ${
            status === "connected"
              ? "text-green-500"
              : status === "connecting"
                ? "text-amber-500"
                : "text-red-500"
          }`}
        >
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              status === "connected"
                ? "bg-green-500 shadow-[0_0_5px_#22c55e]"
                : status === "connecting"
                  ? "animate-pulse bg-amber-500"
                  : "bg-red-500"
            }`}
          />
          {status}
        </div>
      </div>

      <Editor
        height="100%"
        defaultLanguage="rust"
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: mobileMode ? 12 : 14,
          fontFamily: "monospace",
          lineNumbers: mobileMode ? "off" : "on",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          theme: "web3-lab-dark",
          automaticLayout: true,
          wordWrap: mobileMode ? "on" : "off",
          folding: !mobileMode,
          glyphMargin: !mobileMode,
          lineDecorationsWidth: mobileMode ? 4 : 10,
          lineNumbersMinChars: mobileMode ? 2 : 5,
          padding: { top: mobileMode ? 44 : 20 },
        }}
      />
    </div>
  );
};
