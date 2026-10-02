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
import { ChevronRight, FileText, GripVertical, Keyboard, Maximize2, Minimize2 } from 'lucide-react';
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

interface MobileEditorProps {
  roomName: string;
  collaborationProvider?: CollaborationProvider;
  settings?: MonacoEditorSettings;
  value?: string;
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

const ACCESSORY_SYMBOLS = ['{', '}', '(', ')', '[', ']', '&', '*', ':', ';', ',', '.', '::', '->', '=>', '#', '!', '?', '<', '>', '='];

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

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
}

function getVisualViewportHeight(): number {
  if (typeof window === 'undefined') return window.innerHeight;
  return window.visualViewport?.height ?? window.innerHeight;
}

export const MobileEditor: React.FC<MobileEditorProps> = ({
  roomName,
  collaborationProvider,
  settings = { fontSize: 14, tabSize: 2, vimBindings: false },
  value,
  onCodeChange,
}) => {
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [code, setCode] = useState(value ?? DEFAULT_CODE);
  const [monacoError, setMonacoError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showAccessoryBar, setShowAccessoryBar] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [editorScale, setEditorScale] = useState(1);
  const [touchCursorPosition, setTouchCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [showTouchCursor, setShowTouchCursor] = useState(false);
  const linterRef = useRef<SorobanLinterInstance | null>(null);
  const compileActionRef = useRef<{ dispose: () => void } | null>(null);
  const prefersReducedMotion = useMemo(() => getPrefersReducedMotion(), []);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const accessoryBarRef = useRef<HTMLDivElement>(null);
  const lastLayoutRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const layoutRafRef = useRef<number>(0);
  const initialViewportHeight = useRef<number>(0);

  const { theme, colors } = useThemeMode();

  useEffect(() => {
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    if (mobile) {
      setShowAccessoryBar(true);
      const vh = getVisualViewportHeight();
      setViewportHeight(vh);
      initialViewportHeight.current = vh;
    }
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const handleVisualViewportChange = () => {
      const vh = getVisualViewportHeight();
      setViewportHeight(vh);

      const heightDiff = initialViewportHeight.current - vh;
      if (heightDiff > 100) {
        setKeyboardHeight(heightDiff);
      } else {
        setKeyboardHeight(0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, [isMobile]);

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

  const insertSymbol = useCallback((symbol: string) => {
    if (!editorInstance) return;
    const position = editorInstance.getPosition();
    if (!position) return;

    editorInstance.executeEdits('mobile-accessory', [{
      identifier: { major: 1, minor: 1 },
      range: new (window as any).monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      text: symbol,
      forceMoveMarkers: true,
    }]);

    editorInstance.focus();
  }, [editorInstance]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!editorInstance || !editorContainerRef.current) return;
    
    const touch = e.touches[0];
    const rect = editorContainerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    setTouchCursorPosition({ x, y });
    setShowTouchCursor(true);

    const monaco = (window as any).monaco;
    if (monaco) {
      const position = editorInstance.getPositionAt({ x, y });
      if (position) {
        editorInstance.setPosition(position);
      }
    }
  }, [editorInstance]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!editorInstance || !editorContainerRef.current) return;

    const touch = e.touches[0];
    const rect = editorContainerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    setTouchCursorPosition({ x, y });

    const monaco = (window as any).monaco;
    if (monaco) {
      const position = editorInstance.getPositionAt({ x, y });
      if (position) {
        editorInstance.setPosition(position);
      }
    }
  }, [editorInstance]);

  const handleTouchEnd = useCallback(() => {
    setTimeout(() => setShowTouchCursor(false), 2000);
  }, []);

  const handlePinchZoom = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    
    e.preventDefault();
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
    
    if (!editorInstance) return;
    
    const newScale = Math.max(0.5, Math.min(2, distance / 200));
    setEditorScale(newScale);
    editorInstance.updateOptions({ fontSize: Math.round(settings.fontSize * newScale) });
  }, [editorInstance, settings.fontSize]);

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
      fontSize: isMobile ? Math.min(settings.fontSize * editorScale, 16) : settings.fontSize * editorScale,
      tabSize: settings.tabSize,
      cursorStyle: settings.vimBindings ? 'block' : 'line',
    });
    editorInstance.getModel()?.updateOptions({
      tabSize: settings.tabSize,
      insertSpaces: true,
    });
  }, [editorInstance, isMobile, settings.fontSize, settings.tabSize, settings.vimBindings, editorScale]);

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

  const scheduleLayout = useCallback(() => {
    if (layoutRafRef.current) cancelAnimationFrame(layoutRafRef.current);
    layoutRafRef.current = requestAnimationFrame(() => {
      if (editorInstance && editorContainerRef.current) {
        const rect = editorContainerRef.current.getBoundingClientRect();
        if (rect.width !== lastLayoutRef.current.width || rect.height !== lastLayoutRef.current.height) {
          lastLayoutRef.current = { width: rect.width, height: rect.height };
          editorInstance.layout();
        }
      }
    });
  }, [editorInstance]);

  useEffect(() => {
    scheduleLayout();
    const resizeObserver = new ResizeObserver(scheduleLayout);
    if (editorContainerRef.current) {
      resizeObserver.observe(editorContainerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [scheduleLayout]);

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
        <textarea
          aria-label="Soroban contract code editor (fallback)"
          className="h-full w resize-none border-0 bg-zinc-950 p-4 font-mono text-sm text-zinc-300 outline-none"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  const accessoryBarHeight = 56;

  return (
    <div
      className="group relative flex h-full flex-grow flex-col overflow-hidden bg-[#09090b]"
      aria-label="Soroban contract code editor"
      role="region"
      style={{
        paddingBottom: isMobile && showAccessoryBar ? accessoryBarHeight + keyboardHeight : 0,
      }}
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
        {isMobile && (
          <button
            onClick={() => setShowAccessoryBar(!showAccessoryBar)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:border-red-500/40 hover:text-white"
            aria-label={showAccessoryBar ? 'Hide accessory bar' : 'Show accessory bar'}
            title={showAccessoryBar ? 'Hide accessory bar' : 'Show accessory bar'}
          >
            {showAccessoryBar ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div
        ref={editorContainerRef}
        className="relative flex flex-grow flex-col overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
              fontSize: isMobile ? Math.min(settings.fontSize * editorScale, 16) : settings.fontSize * editorScale,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              tabSize: settings.tabSize,
              insertSpaces: true,
              cursorStyle: settings.vimBindings ? 'block' : 'line',
              automaticLayout: true,
              padding: { top: isMobile ? 20 : 24, bottom: isMobile && showAccessoryBar ? accessoryBarHeight + keyboardHeight + 16 : 24 },
              scrollBeyondLastLine: false,
              smoothScrolling: !prefersReducedMotion,
              wordWrap: 'on',
              touchEnabled: true,
              contextmenu: false,
            }}
          />
        </EditorErrorBoundary>

        {showTouchCursor && touchCursorPosition && (
          <div
            className="pointer-events-none fixed z-50"
            style={{
              left: touchCursorPosition.x,
              top: touchCursorPosition.y,
              transform: 'translate(-50%, -50%)',
            }}
            aria-hidden="true"
          >
            <div className="w-1 h-8 bg-red-500/80 rounded-full animate-pulse" />
            <div className="w-1 h-1 bg-red-500/80 rounded-full -mt-1" />
          </div>
        )}
      </div>

      {isMobile && showAccessoryBar && (
        <div
          ref={accessoryBarRef}
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-1 border-t border-white/5 bg-black/80 px-3 py-2 backdrop-blur-xl"
          style={{
            transform: `translateY(${keyboardHeight}px)`,
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          role="toolbar"
          aria-label="Code editing symbols"
        >
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1" style={{ flex: 1 }}>
            {ACCESSORY_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                onClick={() => insertSymbol(symbol)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  insertSymbol(symbol);
                }}
                className="flex h-10 w-10 min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 text-sm font-mono font-medium transition-all active:scale-95 active:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                aria-label={`Insert ${symbol}`}
                title={`Insert ${symbol}`}
              >
                {symbol}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAccessoryBar(false)}
            className="flex h-10 w-10 min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:text-white"
            aria-label="Hide accessory bar"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileEditor;