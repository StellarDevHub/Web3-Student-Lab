import { afterEach, beforeEach, vi } from 'vitest';

interface Disposable {
  dispose: () => void;
}

interface MockCommandRegistry {
  commands: Map<string, (...args: unknown[]) => unknown>;
  actions: Map<string, unknown>;
  languages: Array<{ id: string; aliases?: string[] }>;
  completionProviders: Map<string, unknown[]>;
  hoverProviders: Map<string, unknown[]>;
  codeActionProviders: Map<string, unknown[]>;
  monarchProviders: Map<string, unknown>;
  languageConfigs: Map<string, unknown>;
  markers: Map<unknown, unknown[]>;
  themes: Map<string, unknown>;
  models: unknown[];
}

function createEmptyRegistry(): MockCommandRegistry {
  return {
    commands: new Map(),
    actions: new Map(),
    languages: [],
    completionProviders: new Map(),
    hoverProviders: new Map(),
    codeActionProviders: new Map(),
    monarchProviders: new Map(),
    languageConfigs: new Map(),
    markers: new Map(),
    themes: new Map(),
    models: [],
  };
}

const registry: MockCommandRegistry = createEmptyRegistry();

export function resetMonacoRegistry(): void {
  registry.commands.clear();
  registry.actions.clear();
  registry.languages.length = 0;
  registry.completionProviders.clear();
  registry.hoverProviders.clear();
  registry.codeActionProviders.clear();
  registry.monarchProviders.clear();
  registry.languageConfigs.clear();
  registry.markers.clear();
  registry.themes.clear();
  registry.models.length = 0;
}

export function getMonacoRegistry(): MockCommandRegistry {
  return registry;
}

function makeDisposable(onDispose: () => void): Disposable {
  return { dispose: vi.fn(onDispose) };
}

class MockRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number
  ) {}
}

class MockPosition {
  constructor(
    public lineNumber: number,
    public column: number
  ) {}
}

class MockSelection extends MockRange {
  public selectionStartLineNumber: number;
  public selectionStartColumn: number;
  public positionLineNumber: number;
  public positionColumn: number;

  constructor(
    selectionStartLineNumber: number,
    selectionStartColumn: number,
    positionLineNumber: number,
    positionColumn: number
  ) {
    super(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn);
    this.selectionStartLineNumber = selectionStartLineNumber;
    this.selectionStartColumn = selectionStartColumn;
    this.positionLineNumber = positionLineNumber;
    this.positionColumn = positionColumn;
  }
}

export function createMonacoMock() {
  const editor = {
    registerAction2: vi.fn((actionClassOrDescriptor: unknown): Disposable => {
      const id =
        typeof actionClassOrDescriptor === 'function'
          ? actionClassOrDescriptor.name || `action-${registry.actions.size}`
          : ((actionClassOrDescriptor as { id?: string })?.id ?? `action-${registry.actions.size}`);
      registry.actions.set(id, actionClassOrDescriptor);
      return makeDisposable(() => {
        registry.actions.delete(id);
      });
    }),
    registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown): Disposable => {
      registry.commands.set(id, handler);
      return makeDisposable(() => {
        registry.commands.delete(id);
      });
    }),
    defineTheme: vi.fn((themeName: string, themeData: unknown) => {
      registry.themes.set(themeName, themeData);
    }),
    setTheme: vi.fn(),
    setModelMarkers: vi.fn((model: unknown, _owner: string, markers: unknown[]) => {
      registry.markers.set(model, markers);
    }),
    getModelMarkers: vi.fn(() => Array.from(registry.markers.values()).flat()),
    create: vi.fn(() => ({
      dispose: vi.fn(),
      getValue: vi.fn(() => ''),
      setValue: vi.fn(),
      getModel: vi.fn(() => null),
      onDidChangeModelContent: vi.fn(() => makeDisposable(() => {})),
      updateOptions: vi.fn(),
      layout: vi.fn(),
      focus: vi.fn(),
      addCommand: vi.fn(() => 'mock-command-id'),
      addAction: vi.fn(() => makeDisposable(() => {})),
    })),
    createModel: vi.fn((value = '', language?: string, uri?: unknown) => {
      const model = {
        getValue: vi.fn(() => value),
        setValue: vi.fn(),
        getLanguageId: vi.fn(() => language ?? 'plaintext'),
        uri,
        dispose: vi.fn(),
      };
      registry.models.push(model);
      return model;
    }),
    getModels: vi.fn(() => [...registry.models]),
    getModel: vi.fn(() => null),
  };

  const languages = {
    getLanguages: vi.fn(() => [...registry.languages]),
    register: vi.fn((language: { id: string; aliases?: string[] }) => {
      if (!registry.languages.some((l) => l.id === language.id)) {
        registry.languages.push(language);
      }
    }),
    setMonarchTokensProvider: vi.fn((languageId: string, provider: unknown): Disposable => {
      registry.monarchProviders.set(languageId, provider);
      return makeDisposable(() => {
        registry.monarchProviders.delete(languageId);
      });
    }),
    setLanguageConfiguration: vi.fn((languageId: string, config: unknown): Disposable => {
      registry.languageConfigs.set(languageId, config);
      return makeDisposable(() => {
        registry.languageConfigs.delete(languageId);
      });
    }),
    registerCompletionItemProvider: vi.fn((languageId: string, provider: unknown): Disposable => {
      const list = registry.completionProviders.get(languageId) ?? [];
      list.push(provider);
      registry.completionProviders.set(languageId, list);
      return makeDisposable(() => {
        const current = registry.completionProviders.get(languageId) ?? [];
        registry.completionProviders.set(
          languageId,
          current.filter((p) => p !== provider)
        );
      });
    }),
    registerHoverProvider: vi.fn((languageId: string, provider: unknown): Disposable => {
      const list = registry.hoverProviders.get(languageId) ?? [];
      list.push(provider);
      registry.hoverProviders.set(languageId, list);
      return makeDisposable(() => {
        const current = registry.hoverProviders.get(languageId) ?? [];
        registry.hoverProviders.set(
          languageId,
          current.filter((p) => p !== provider)
        );
      });
    }),
    registerCodeActionProvider: vi.fn((languageId: string, provider: unknown): Disposable => {
      const list = registry.codeActionProviders.get(languageId) ?? [];
      list.push(provider);
      registry.codeActionProviders.set(languageId, list);
      return makeDisposable(() => {
        const current = registry.codeActionProviders.get(languageId) ?? [];
        registry.codeActionProviders.set(
          languageId,
          current.filter((p) => p !== provider)
        );
      });
    }),
    CompletionItemKind: {
      Method: 0,
      Function: 1,
      Constructor: 2,
      Field: 3,
      Variable: 4,
      Class: 5,
      Struct: 6,
      Interface: 7,
      Module: 8,
      Property: 9,
      Event: 10,
      Operator: 11,
      Unit: 12,
      Value: 13,
      Constant: 14,
      Enum: 15,
      EnumMember: 16,
      Keyword: 17,
      Text: 18,
      Color: 19,
      File: 20,
      Reference: 21,
      Customcolor: 22,
      Folder: 23,
      TypeParameter: 24,
      User: 25,
      Issue: 26,
      Snippet: 27,
    },
    CompletionItemInsertTextRule: {
      None: 0,
      KeepWhitespace: 1,
      InsertAsSnippet: 4,
    },
  };

  return {
    editor,
    languages,
    MarkerSeverity: {
      Hint: 1,
      Info: 2,
      Warning: 4,
      Error: 8,
    },
    KeyCode: {
      Enter: 3,
      Escape: 9,
      Space: 10,
    },
    KeyMod: {
      CtrlCmd: 2048,
      Shift: 1024,
      Alt: 512,
      WinCtrl: 256,
    },
    Range: MockRange,
    Position: MockPosition,
    Selection: MockSelection,
    Uri: {
      parse: vi.fn((value: string) => ({ toString: () => value, path: value })),
      file: vi.fn((path: string) => ({ toString: () => `file://${path}`, path })),
    },
  };
}

const monacoMock = vi.hoisted(() => ({
  editor: {} as Record<string, unknown>,
  languages: {} as Record<string, unknown>,
  MarkerSeverity: {
    Hint: 1,
    Info: 2,
    Warning: 4,
    Error: 8,
  },
  KeyCode: {
    Enter: 3,
    Escape: 9,
    Space: 10,
  },
  KeyMod: {
    CtrlCmd: 2048,
    Shift: 1024,
    Alt: 512,
    WinCtrl: 256,
  },
  Range: class {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
  Position: class {
    constructor(
      public lineNumber: number,
      public column: number
    ) {}
  },
  Selection: class {
    constructor(
      public selectionStartLineNumber: number,
      public selectionStartColumn: number,
      public positionLineNumber: number,
      public positionColumn: number
    ) {}
  },
  Uri: {} as Record<string, unknown>,
}));

function restoreMonacoMockImplementations(): void {
  const fresh = createMonacoMock();
  Object.assign(monacoMock.editor, fresh.editor);
  Object.assign(monacoMock.languages, fresh.languages);
  Object.assign(monacoMock.Uri, fresh.Uri);
}

restoreMonacoMockImplementations();

vi.mock('monaco-editor', () => ({
  ...monacoMock,
  default: monacoMock,
}));

beforeEach(() => {
  resetMonacoRegistry();
  restoreMonacoMockImplementations();
});

afterEach(() => {
  resetMonacoRegistry();
});
