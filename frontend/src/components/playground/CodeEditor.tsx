'use client';

import dynamic from 'next/dynamic';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import React, { useMemo, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { CollaborationProvider } from '@/lib/collaboration/YjsProvider';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Initializing Editor...</p>
      </div>
    </div>
  ),
});

interface CodeEditorProps {
  roomName: string;
  mobileMode?: boolean;
  collaborationProvider?: CollaborationProvider;
}

const DEFAULT_CODE = `#![no_std]

use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(_env: Env) -> Symbol {
        Symbol::new(&_env, "hello")
    }
}`;

export const CodeEditor: React.FC<CodeEditorProps> = ({
  roomName,
  mobileMode = false,
  collaborationProvider,
}) => {
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const collaboratorLabel = useMemo(() => {
    if (collaborationProvider) {
      return 'Connected';
    }
    return roomName ? 'Local Session' : 'Standalone';
  }, [collaborationProvider, roomName]);

  const handleEditorDidMount: OnMount = (mountedEditor, monaco) => {
    setEditorInstance(mountedEditor);
    monaco.editor.defineTheme('web3-lab-premium', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '636e7b', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'type', foreground: '79c0ff' },
        { token: 'function', foreground: 'd2a8ff' },
      ],
      colors: {
        'editor.background': '#09090b',
        'editor.lineHighlightBackground': '#ffffff05',
        'editorCursor.foreground': '#ef4444',
        'editor.selectionBackground': '#ef444422',
        'editorLineNumber.foreground': '#4b5563',
        'editorLineNumber.activeForeground': '#f3f4f6',
      },
    });
    monaco.editor.setTheme('web3-lab-premium');
  };

  return (
    <div className="group relative flex h-full flex-grow flex-col overflow-hidden bg-[#09090b]">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-white/5 bg-black/40 px-6 py-2 text-[10px] font-bold tracking-widest text-gray-500 uppercase">
        <FileText className="h-3.5 w-3.5 text-gray-400" />
        <span>Web3-Student-Lab</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-300">contracts</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-red-500">lib.rs</span>
        <div className="flex-grow" />
        <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-gray-400">
          {collaboratorLabel}
        </span>
        {editorInstance && (
          <span className="text-[9px] text-gray-500">
            Ln {editorInstance.getPosition()?.lineNumber ?? 1}, Col{' '}
            {editorInstance.getPosition()?.column ?? 1}
          </span>
        )}
      </div>

      <div className="relative flex-grow">
        <Editor
          height="100%"
          defaultLanguage="rust"
          language="rust"
          value={code}
          onChange={(value) => setCode(value ?? '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: mobileMode ? 12 : 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            automaticLayout: true,
            padding: { top: mobileMode ? 20 : 24 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
