import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMonaco = {
  languages: {
    getLanguages: vi.fn(),
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
    registerHoverProvider: vi.fn(),
    CompletionItemKind: {} as Record<string, number>,
    CompletionItemInsertTextRule: {} as Record<string, number>,
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
});

describe('extendRustLanguage', () => {
  it('should register Monarch tokens for rust language when rust exists', async () => {
    const { extendRustLanguage } = await import('../SorobanLanguage');
    mockMonaco.languages.getLanguages.mockReturnValue([{ id: 'rust' }]);

    extendRustLanguage(mockMonaco as any);

    expect(mockMonaco.languages.getLanguages).toHaveBeenCalled();
    expect(mockMonaco.languages.register).not.toHaveBeenCalled();
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      'rust',
      expect.any(Object)
    );
  });

  it('should register rust language first if it does not exist', async () => {
    const { extendRustLanguage } = await import('../SorobanLanguage');
    mockMonaco.languages.getLanguages.mockReturnValue([]);

    extendRustLanguage(mockMonaco as any);

    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'rust' });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      'rust',
      expect.any(Object)
    );
  });

  it('should provide a tokenizer with Soroban-specific token types', async () => {
    const { extendRustLanguage, SOROBAN_TOKEN_TYPES } = await import('../SorobanLanguage');
    mockMonaco.languages.getLanguages.mockReturnValue([{ id: 'rust' }]);

    extendRustLanguage(mockMonaco as any);

    const [, tokenizer] = mockMonaco.languages.setMonarchTokensProvider.mock.calls[0];
    expect(tokenizer.tokenizer.root).toBeDefined();
    expect(Array.isArray(tokenizer.tokenizer.root)).toBe(true);

    const hasSorobanMacroRule = tokenizer.tokenizer.root.some(
      (rule: unknown[]) => Array.isArray(rule) && rule[1] === SOROBAN_TOKEN_TYPES.SOROBAN_MACRO
    );
    expect(hasSorobanMacroRule).toBe(true);

    const hasSorobanTypeRule = tokenizer.tokenizer.root.some(
      (rule: unknown[]) => Array.isArray(rule) && rule[1] === SOROBAN_TOKEN_TYPES.SOROBAN_TYPE
    );
    expect(hasSorobanTypeRule).toBe(true);

    const hasSorobanModuleRule = tokenizer.tokenizer.root.some(
      (rule: unknown[]) => Array.isArray(rule) && rule[1] === SOROBAN_TOKEN_TYPES.SOROBAN_MODULE
    );
    expect(hasSorobanModuleRule).toBe(true);

    const hasModuleSeparatorRule = tokenizer.tokenizer.root.some(
      (rule: unknown[]) => Array.isArray(rule) && rule[1] === SOROBAN_TOKEN_TYPES.MODULE_SEPARATOR
    );
    expect(hasModuleSeparatorRule).toBe(true);
  });
});

describe('registerSorobanLanguage', () => {
  it('should register the soroban-rust language', async () => {
    const { registerSorobanLanguage, SOROBAN_LANGUAGE_ID } = await import('../SorobanLanguage');

    registerSorobanLanguage(mockMonaco as any);

    expect(mockMonaco.languages.register).toHaveBeenCalledWith({
      id: SOROBAN_LANGUAGE_ID,
      aliases: ['Soroban Rust', 'Soroban', 'soroban-rust'],
    });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      SOROBAN_LANGUAGE_ID,
      expect.any(Object)
    );
  });

  it('should not register twice', async () => {
    const { registerSorobanLanguage } = await import('../SorobanLanguage');

    registerSorobanLanguage(mockMonaco as any);
    registerSorobanLanguage(mockMonaco as any);

    expect(mockMonaco.languages.register).toHaveBeenCalledTimes(1);
  });

  it('should set language configuration', async () => {
    const { registerSorobanLanguage, SOROBAN_LANGUAGE_ID } = await import('../SorobanLanguage');

    registerSorobanLanguage(mockMonaco as any);

    expect(mockMonaco.languages.setLanguageConfiguration).toHaveBeenCalledWith(
      SOROBAN_LANGUAGE_ID,
      expect.objectContaining({
        comments: {
          lineComment: '//',
          blockComment: ['/*', '*/'],
        },
      })
    );
  });
});

describe('detectSorobanContext', () => {
  it('should detect soroban_sdk imports', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('use soroban_sdk::{contract, Env};');
    expect(result.hasSorobanImports).toBe(true);
    expect(result.looksLikeContract).toBe(true);
  });

  it('should detect env.storage() usage', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('env.storage()');
    expect(result.usesEnvStorage).toBe(true);
  });

  it('should detect soroban macros', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('#[contract]');
    expect(result.hasSorobanMacros).toBe(true);
  });

  it('should detect contract struct patterns', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('pub struct HelloContract;');
    expect(result.looksLikeContract).toBe(true);
  });

  it('should detect no_std attribute', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('#![no_std]');
    expect(result.looksLikeContract).toBe(true);
  });

  it('should return false for empty source', async () => {
    const { detectSorobanContext } = await import('../SorobanLanguage');
    const result = detectSorobanContext('');
    expect(result.hasSorobanImports).toBe(false);
    expect(result.usesEnvStorage).toBe(false);
    expect(result.hasSorobanMacros).toBe(false);
    expect(result.looksLikeContract).toBe(false);
  });
});

describe('analyzeSorobanSource', () => {
  it('should detect #[soroban_contract] and suggest #[contract]', async () => {
    const { analyzeSorobanSource } = await import('../SorobanLanguage');
    const diagnostics = analyzeSorobanSource('#[soroban_contract]');
    expect(diagnostics.some((d) => d.code === 'replace-soroban-contract')).toBe(true);
  });

  it('should detect env.storage without call', async () => {
    const { analyzeSorobanSource } = await import('../SorobanLanguage');
    const diagnostics = analyzeSorobanSource('env.storage.get()');
    expect(diagnostics.some((d) => d.code === 'insert-storage-call')).toBe(true);
  });

  it('should not flag env.storage() correctly', async () => {
    const { analyzeSorobanSource } = await import('../SorobanLanguage');
    const diagnostics = analyzeSorobanSource('env.storage()');
    expect(diagnostics.some((d) => d.code === 'insert-storage-call')).toBe(false);
  });

  it('should detect unclosed brace', async () => {
    const { analyzeSorobanSource } = await import('../SorobanLanguage');
    const diagnostics = analyzeSorobanSource('fn test() {');
    expect(diagnostics.some((d) => d.code === 'soroban-unclosed-brace-open')).toBe(true);
  });
});

describe('SOROBAN_TOKEN_TYPES', () => {
  it('should define all required token types', async () => {
    const { SOROBAN_TOKEN_TYPES } = await import('../SorobanLanguage');
    expect(SOROBAN_TOKEN_TYPES.SOROBAN_MACRO).toBe('sorobanMacro');
    expect(SOROBAN_TOKEN_TYPES.SOROBAN_TYPE).toBe('sorobanType');
    expect(SOROBAN_TOKEN_TYPES.SOROBAN_MODULE).toBe('sorobanModule');
    expect(SOROBAN_TOKEN_TYPES.MODULE_SEPARATOR).toBe('moduleSeparator');
  });
});
