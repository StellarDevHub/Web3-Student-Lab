const mockMonaco = {
  languages: {
    getLanguages: () => [{ id: 'rust' }],
    register: () => {},
    setMonarchTokensProvider: () => {},
    setLanguageConfiguration: () => {},
    registerCompletionItemProvider: () => {},
    registerHoverProvider: () => {},
    registerCodeActionProvider: () => {},
    CompletionItemKind: {
      Method: 0,
      Keyword: 1,
      Struct: 2,
      Snippet: 3,
    } as Record<string, number>,
    CompletionItemInsertTextRule: {
      InsertAsSnippet: 1,
    } as Record<string, number>,
  },
  editor: {
    defineTheme: () => {},
    setTheme: () => {},
    setModelMarkers: () => {},
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

export default mockMonaco;
export const languages = mockMonaco.languages;
export const editor = mockMonaco.editor;
export const MarkerSeverity = mockMonaco.MarkerSeverity;
export const Range = mockMonaco.Range;
