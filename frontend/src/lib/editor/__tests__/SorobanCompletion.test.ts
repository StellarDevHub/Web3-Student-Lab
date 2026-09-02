import { describe, it, expect, vi, beforeEach } from 'vitest';

type ProvideCompletionItems = (
  model: any,
  position: any
) => { suggestions: any[] } | Promise<{ suggestions: any[] }>;

interface RegisteredProvider {
  languageId: string;
  triggerCharacters: string[];
  provideCompletionItems: ProvideCompletionItems;
}

const mockModel = (content: string) => ({
  getValue: () => content,
  getLineContent: (lineNumber: number) => {
    const lines = content.split('\n');
    return lines[lineNumber - 1] ?? '';
  },
  getWordUntilPosition: () => ({
    startColumn: 1,
    endColumn: 1,
  }),
});

const mockPosition = (lineNumber: number, column: number) => ({
  lineNumber,
  column,
});

let registeredProviders: RegisteredProvider[] = [];

const mockMonaco = {
  languages: {
    registerCompletionItemProvider: vi.fn(
      (
        languageId: string,
        provider: { triggerCharacters: string[]; provideCompletionItems: ProvideCompletionItems }
      ) => {
        registeredProviders.push({
          languageId,
          triggerCharacters: provider.triggerCharacters,
          provideCompletionItems: provider.provideCompletionItems.bind(provider),
        });
      }
    ),
    CompletionItemKind: {
      Method: 0,
      Keyword: 1,
      Struct: 2,
      Snippet: 3,
    },
    CompletionItemInsertTextRule: {
      InsertAsSnippet: 1,
    },
  },
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    setModelMarkers: vi.fn(),
  },
  MarkerSeverity: {
    Error: 1,
    Warning: 2,
    Info: 3,
    Hint: 4,
  },
  Range: class {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  registeredProviders = [];
});

describe('registerSorobanCompletion', () => {
  it('should register provider for soroban-rust language', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'soroban-rust');
    expect(provider).toBeDefined();
  });

  it('should register provider for rust language', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust');
    expect(provider).toBeDefined();
  });

  it('should include . and : as trigger characters', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    for (const provider of registeredProviders) {
      expect(provider.triggerCharacters).toContain('.');
      expect(provider.triggerCharacters).toContain(':');
    }
  });

  it('should not register twice', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);
    registerSorobanCompletion(mockMonaco as any);

    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(2);
  });

  it('should return env completions when typing env.', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('env.');
    const position = mockPosition(1, 5);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.length).toBeGreaterThan(0);
    const storageCompletion = result.suggestions.find((s: any) => s.label === 'storage()');
    expect(storageCompletion).toBeDefined();
    expect(storageCompletion.detail).toBe('Access contract storage');
    expect(storageCompletion.documentation).toBeDefined();
  });

  it('should return env completions when typing env. (with proper column)', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('env.foo');
    const position = mockPosition(1, 5);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('should return storage completions when typing storage().', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('storage().x');
    const position = mockPosition(1, 11);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.length).toBeGreaterThan(0);
    const instanceCompletion = result.suggestions.find((s: any) => s.label === 'instance()');
    expect(instanceCompletion).toBeDefined();
    expect(instanceCompletion.insertText).toBe('instance()');
  });

  it('should return Soroban completions when soroban_sdk:: is in context', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('use soroban_sdk::{};');
    const position = mockPosition(1, 20);
    const result = await provider.provideCompletionItems(model, position);

    const envCompletion = result.suggestions.find((s: any) => s.label === 'Env');
    expect(envCompletion).toBeDefined();
    expect(envCompletion.insertText).toBe('Env');
    expect(envCompletion.documentation).toBeDefined();
  });

  it('should return invoke_contract completion for env.', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('env.');
    const position = mockPosition(1, 5);
    const result = await provider.provideCompletionItems(model, position);

    const invokeCompletion = result.suggestions.find((s: any) => s.label === 'invoke_contract()');
    expect(invokeCompletion).toBeDefined();
    expect(invokeCompletion.insertText).toContain('invoke_contract(');
    expect(invokeCompletion.documentation).toBeDefined();
  });

  it('should return log! completion in contract context', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('use soroban_sdk::{};\n');
    const position = mockPosition(2, 1);
    const result = await provider.provideCompletionItems(model, position);

    const logCompletion = result.suggestions.find((s: any) => s.label === 'log!');
    expect(logCompletion).toBeDefined();
    expect(logCompletion.insertText).toContain('log!');
    expect(logCompletion.documentation).toBeDefined();
  });

  it('should include Vec and Map in Soroban completions', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('use soroban_sdk::{};');
    const position = mockPosition(1, 20);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.find((s: any) => s.label === 'Vec')).toBeDefined();
    expect(result.suggestions.find((s: any) => s.label === 'Map')).toBeDefined();
  });

  it('should include storage chain completions', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('use soroban_sdk::{};\n');
    const position = mockPosition(2, 1);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.find((s: any) => s.label === 'storage chain')).toBeDefined();
    expect(result.suggestions.find((s: any) => s.label === 'storage set chain')).toBeDefined();
    expect(result.suggestions.find((s: any) => s.label === 'storage has chain')).toBeDefined();
  });

  it('should not crash when model throws', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const throwingModel = {
      getValue: () => {
        throw new Error('model error');
      },
      getLineContent: () => {
        throw new Error('model error');
      },
      getWordUntilPosition: () => {
        throw new Error('model error');
      },
    };

    const result = await provider.provideCompletionItems(throwingModel, mockPosition(1, 1));
    expect(result.suggestions).toEqual([]);
  });

  it('should return default completion when no specific context matches', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('fn f() { }');
    const position = mockPosition(1, 10);
    const result = await provider.provideCompletionItems(model, position);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].label).toBe('storage()');
  });

  it('should include detail and documentation on all suggestions', async () => {
    const { registerSorobanCompletion } = await import('../SorobanCompletion');
    registerSorobanCompletion(mockMonaco as any);

    const provider = registeredProviders.find((p) => p.languageId === 'rust')!;
    const model = mockModel('env.');
    const position = mockPosition(1, 5);
    const result = await provider.provideCompletionItems(model, position);

    for (const suggestion of result.suggestions) {
      expect(suggestion.detail).toBeTruthy();
      expect(suggestion.documentation).toBeTruthy();
    }
  });
});
