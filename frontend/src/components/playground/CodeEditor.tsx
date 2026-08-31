'use client';

import type { CollaborationProvider } from '@/lib/collaboration/YjsProvider';
import { registerSorobanCompletion } from '@/lib/editor/SorobanCompletion';
import { registerSorobanHover } from '@/lib/editor/SorobanHover';
import { extendRustLanguage } from '@/lib/editor/SorobanLanguage';
import type { SorobanLinterInstance } from '@/lib/editor/SorobanLinter';
import { createSorobanLinter } from '@/lib/editor/SorobanLinter';
import { THEME_COLORS } from '@/lib/theme/themeColors';
import { useThemeMode } from '@/hooks/useThemeMode';
import type { OnMount } from '@monaco-editor/react';
import { ChevronRight, FileText } from 'lucide-react';
import type { editor } from 'monaco-editor';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  settings?: MonacoEditorSettings;
  value?: string;
  /** Optional callback fired whenever the editor content changes */
  onCodeChange?: (value: string) => void;
}

export interface MonacoEditorSettings {
  fontSize: number;
  tabSize: number;
  vimBindings: boolean;
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

class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function FallbackTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2">
        <span className="text-xs font-bold tracking-wider text-red-400 uppercase">
          Editor Unavailable
        </span>
        <span className="text-xs text-zinc-500">
          Monaco editor failed to load. Using plain text fallback.
        </span>
      </div>
      <textarea
        aria-label="Soroban contract code editor (fallback)"
        className="h-full w resize-none border-0 bg-zinc-950 p-4 font-mono text-sm text-zinc-300 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  roomName,
  mobileMode = false,
  collaborationProvider,
  settings = { fontSize: 14, tabSize: 2, vimBindings: false },
  value,
  onCodeChange,
}) => {
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [code, setCode] = useState(value ?? DEFAULT_CODE);
  const [monacoError, setMonacoError] = useState(false);
  const linterRef = useRef<SorobanLinterInstance | null>(null);
  const compileActionRef = useRef<{ dispose: () => void } | null>(null);
  const prefersReducedMotion = useMemo(() => getPrefersReducedMotion(), []);
  
  const { theme, colors } = useThemeMode();

  useEffect(() => {
    if (!editorInstance) return;
    const monaco = (window as any).monaco;
    if (!monaco) return;
    
    const baseTheme = theme === 'light' ? 'vs' : 'hc-black';
    monaco.editor.defineTheme('web3-lab-premium', {
      base: baseTheme,
      inherit: true,
      rules: [
        { token: 'comment', foreground: '636e7b', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'type', foreground: '79c0ff' },
        { token: 'function', foreground: 'd2a8ff' },
        {
          token: 'sorobanMacro',
          foreground: colors.interactive.primary.replace('#', ''),
          fontStyle: 'bold',
        },
        {
          token: 'sorobanType',
          foreground: colors.status.info.replace('#', ''),
          fontStyle: 'bold',
        },
        {
          token: 'sorobanModule',
          foreground: colors.status.warning.replace('#', ''),
        },
        {
          token: 'moduleSeparator',
          foreground: colors.text.muted.replace('#', ''),
        },
      ],
      colors: {
        'editor.background': colors.background.primary,
        'editor.lineHighlightBackground': theme === 'light' ? '#00000005' : '#ffffff05',
        'editorCursor.foreground': colors.status.error,
        'editor.selectionBackground': `${colors.status.error}22`,
        'editorLineNumber.foreground': colors.text.muted,
        'editorLineNumber.activeForeground': colors.text.secondary,
      },
    });
    monaco.editor.setTheme('web3-lab-premium');
  }, [editorInstance, theme, colors]);


  const collaboratorLabel = useMemo(() => {
    if (collaborationProvider) {
      return 'Connected';
    }
    return roomName ? 'Local Session' : 'Standalone';
  }, [collaborationProvider, roomName]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const next = value ?? '';
    setCode(next);
    onCodeChange?.(next);
  }, [onCodeChange]);

  useEffect(() => {
    if (value !== undefined && value !== code) {
      setCode(value);
    }
  }, [value, code]);

  const handleMonacoError = useCallback(() => {
    setMonacoError(true);
  }, []);

  const handleEditorDidMount: OnMount = useCallback(
    (mountedEditor, monaco) => {
      setEditorInstance(mountedEditor);
      compileActionRef.current?.dispose();
      compileActionRef.current = mountedEditor.addAction({
        id: 'web3-lab.compile-contract',
        label: 'Compile Contract',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          document.dispatchEvent(new CustomEvent('playground-compile'));
        },
      });

      extendRustLanguage(monaco);
      registerSorobanCompletion(monaco);
      registerSorobanHover(monaco);

      const baseTheme = theme === 'light' ? 'vs' : 'hc-black';
      monaco.editor.defineTheme('web3-lab-premium', {
        base: baseTheme,
        inherit: true,
        rules: [
          { token: 'comment', foreground: '636e7b', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
          { token: 'string', foreground: 'a5d6ff' },
          { token: 'type', foreground: '79c0ff' },
          { token: 'function', foreground: 'd2a8ff' },
          {
            token: 'sorobanMacro',
            foreground: colors.interactive.primary.replace('#', ''),
            fontStyle: 'bold',
          },
          {
            token: 'sorobanType',
            foreground: colors.status.info.replace('#', ''),
            fontStyle: 'bold',
          },
          {
            token: 'sorobanModule',
            foreground: colors.status.warning.replace('#', ''),
          },
          {
            token: 'moduleSeparator',
            foreground: colors.text.muted.replace('#', ''),
          },
        ],
        colors: {
          'editor.background': colors.background.primary,
          'editor.lineHighlightBackground': theme === 'light' ? '#00000005' : '#ffffff05',
          'editorCursor.foreground': colors.status.error,
          'editor.selectionBackground': `${colors.status.error}22`,
          'editorLineNumber.foreground': colors.text.muted,
          'editorLineNumber.activeForeground': colors.text.secondary,
        },
      });
      monaco.editor.setTheme('web3-lab-premium');


      const model = mountedEditor.getModel();
      if (model) {
        model.updateOptions({ tabSize: settings.tabSize, insertSpaces: true });
        if (linterRef.current) {
          linterRef.current.dispose();
        }
        linterRef.current = createSorobanLinter({
          model,
          monacoApi: monaco,
          debounceMs: 300,
        });
      }
    },
    [settings.tabSize]
  );

  useEffect(() => {
    if (!editorInstance) return;
    editorInstance.updateOptions({
      fontSize: mobileMode ? Math.min(settings.fontSize, 14) : settings.fontSize,
      tabSize: settings.tabSize,
      cursorStyle: settings.vimBindings ? 'block' : 'line',
    });
    editorInstance.getModel()?.updateOptions({
      tabSize: settings.tabSize,
      insertSpaces: true,
    });
  }, [editorInstance, mobileMode, settings.fontSize, settings.tabSize, settings.vimBindings]);

  useEffect(() => {
    return () => {
      if (linterRef.current) {
        linterRef.current.dispose();
        linterRef.current = null;
      }
      compileActionRef.current?.dispose();
      compileActionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (value !== undefined && value !== code) {
      setCode(value);
    }
  }, [value, code]);

  if (monacoError) {
    return (
      <div
        className="group relative flex h-full flex-grow flex-col overflow-hidden bg-[#09090b]"
        aria-label="Soroban contract code editor"
        role="region"
      >
        <div className="flex items-center gap-2 border-b border-white/5 bg-black/40 px-6 py-2 text-[10px] font-bold tracking-widest text-gray-500 uppercase">
          <FileText className="h-3.5 w-3.5 text-gray-400" />
          <span>Web3-Student-Lab</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-300">contracts</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-red-500">lib.rs</span>
        </div>
        <FallbackTextarea value={code} onChange={handleCodeChange} />
      </div>
    );
  }

  return (
    <div
      className="group relative flex h-full flex-grow flex-col overflow-hidden bg-[#09090b]"
      aria-label="Soroban contract code editor"
      role="region"
    >
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
        <EditorErrorBoundary onError={handleMonacoError}>
          <Editor
            height="100%"
            defaultLanguage="rust"
            language="rust"
            value={code}
            onChange={handleCodeChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: mobileMode ? Math.min(settings.fontSize, 14) : settings.fontSize,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              tabSize: settings.tabSize,
              insertSpaces: true,
              cursorStyle: settings.vimBindings ? 'block' : 'line',
              automaticLayout: true,
              padding: { top: mobileMode ? 20 : 24 },
              scrollBeyondLastLine: false,
              smoothScrolling: !prefersReducedMotion,
              wordWrap: 'on',
            }}
          />
        </EditorErrorBoundary>
      </div>
    </div>
  );
};

export default CodeEditor;
