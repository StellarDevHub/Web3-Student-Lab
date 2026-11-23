import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockEditorOnMount = vi.fn();
const mockExtendRustLanguage = vi.fn();
const mockRegisterCompletion = vi.fn();
const mockRegisterHover = vi.fn();
const mockCreateLinter = vi.fn(() => ({ dispose: vi.fn(), run: vi.fn() }));

vi.mock('next/dynamic', () => ({
  default: () => {
    const MockEditorWrapper = (props: any) => {
      return (
        <div data-testid="monaco-editor" data-language={props.language} data-default-language={props.defaultLanguage}>
          <button
            data-testid="mock-mount"
            onClick={() =>
              props.onMount?.(
                {
                  getPosition: () => ({ lineNumber: 1, column: 1 }),
                  getModel: () => ({
                    getValue: () => '',
                    onDidChangeContent: () => ({ dispose: vi.fn() }),
                  }),
                },
                {
                  languages: {
                    getLanguages: () => [{ id: 'rust' }],
                    register: vi.fn(),
                    setMonarchTokensProvider: vi.fn(),
                    setLanguageConfiguration: vi.fn(),
                    registerCompletionItemProvider: vi.fn(),
                    CompletionItemKind: {},
                    CompletionItemInsertTextRule: {},
                  },
                  editor: {
                    defineTheme: vi.fn(),
                    setTheme: vi.fn(),
                    setModelMarkers: vi.fn(),
                  },
                  MarkerSeverity: { Error: 1, Warning: 2, Info: 3, Hint: 4 },
                  Range: class {},
                }
              )
            }
          >
            Mount Editor
          </button>
          <textarea
            data-testid="mock-editor-textarea"
            onChange={(e) => props.onChange?.(e.target.value)}
          />
        </div>
      );
    };
    MockEditorWrapper.displayName = 'DynamicEditor';
    return MockEditorWrapper;
  },
}));

vi.mock('@/lib/editor/SorobanLanguage', () => ({
  extendRustLanguage: mockExtendRustLanguage,
  registerSorobanLanguage: vi.fn(),
  detectSorobanContext: vi.fn(() => ({
    hasSorobanImports: false,
    usesEnvStorage: false,
    hasSorobanMacros: false,
    looksLikeContract: false,
  })),
  SOROBAN_LANGUAGE_ID: 'soroban-rust',
  SOROBAN_TOKEN_TYPES: {
    SOROBAN_MACRO: 'sorobanMacro',
    SOROBAN_TYPE: 'sorobanType',
    SOROBAN_MODULE: 'sorobanModule',
    MODULE_SEPARATOR: 'moduleSeparator',
  },
  analyzeSorobanSource: vi.fn(() => []),
  setSorobanDiagnostics: vi.fn(),
  registerSorobanCodeActions: vi.fn(),
}));

vi.mock('@/lib/editor/SorobanCompletion', () => ({
  registerSorobanCompletion: mockRegisterCompletion,
}));

vi.mock('@/lib/editor/SorobanHover', () => ({
  registerSorobanHover: mockRegisterHover,
}));

vi.mock('@/lib/editor/SorobanLinter', () => ({
  createSorobanLinter: mockCreateLinter,
}));

vi.mock('@/lib/theme/themeColors', () => ({
  THEME_COLORS: {
    dark: {
      background: { primary: '#000000', secondary: '#0a0a0a', tertiary: '#121212', accent: '#1a1a1a' },
      text: { primary: '#ffffff', secondary: '#e5e5e5', tertiary: '#a0a0a0', muted: '#666666' },
      border: { light: '#2d2d2d', medium: '#3d3d3d', dark: '#4d4d4d' },
      interactive: { primary: '#7C3AED', primaryHover: '#a78bfa', secondary: '#2d2d2d', secondaryHover: '#3d3d3d' },
      status: { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' },
      chart: { primary: '#7C3AED', accent: '#A78BFA', neutral: '#4b5563', text: '#ffffff' },
    },
  },
}));

vi.mock('lucide-react', () => ({
  ChevronRight: () => <span data-testid="chevron-right" />,
  FileText: () => <span data-testid="file-text" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('CodeEditor', () => {
  it('should render the editor container with aria-label', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    const { container } = render(<CodeEditor roomName="test-room" />);

    const editorContainer = container.querySelector('[aria-label="Soroban contract code editor"]');
    expect(editorContainer).toBeTruthy();
  });

  it('should render the editor container with role="region"', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    const { container } = render(<CodeEditor roomName="test-room" />);

    const editorContainer = container.querySelector('[role="region"]');
    expect(editorContainer).toBeTruthy();
  });

  it('should set editor language to rust', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    render(<CodeEditor roomName="test-room" />);

    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-language', 'rust');
  });

  it('should call extendRustLanguage on mount', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    render(<CodeEditor roomName="test-room" />);

    const mountButton = screen.getByTestId('mock-mount');
    fireEvent.click(mountButton);

    expect(mockExtendRustLanguage).toHaveBeenCalled();
  });

  it('should call registerSorobanCompletion on mount', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    render(<CodeEditor roomName="test-room" />);

    const mountButton = screen.getByTestId('mock-mount');
    fireEvent.click(mountButton);

    expect(mockRegisterCompletion).toHaveBeenCalled();
  });

  it('should call registerSorobanHover on mount', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    render(<CodeEditor roomName="test-room" />);

    const mountButton = screen.getByTestId('mock-mount');
    fireEvent.click(mountButton);

    expect(mockRegisterHover).toHaveBeenCalled();
  });

  it('should create linter on mount', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    render(<CodeEditor roomName="test-room" />);

    const mountButton = screen.getByTestId('mock-mount');
    fireEvent.click(mountButton);

    expect(mockCreateLinter).toHaveBeenCalledWith(
      expect.objectContaining({
        debounceMs: 300,
      })
    );
  });

  it('should have the correct file path shown in the breadcrumb', async () => {
    const { default: CodeEditor } = await import('../CodeEditor');
    const { container } = render(<CodeEditor roomName="test-room" />);

    const libRsElements = container.querySelectorAll('span');
    const libRs = Array.from(libRsElements).find((el) => el.textContent === 'lib.rs');
    expect(libRs).toBeTruthy();

    const contractsElements = container.querySelectorAll('span');
    const contracts = Array.from(contractsElements).find((el) => el.textContent === 'contracts');
    expect(contracts).toBeTruthy();
  });
});
