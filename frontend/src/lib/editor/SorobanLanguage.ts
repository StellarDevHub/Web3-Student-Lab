import * as monaco from 'monaco-editor';

export const SOROBAN_LANGUAGE_ID = 'soroban-rust';

let languageRegistered = false;
let codeActionsRegistered = false;

const sorobanMacros = [
  'contract',
  'contractimpl',
  'contracttype',
  'contractevent',
  'contracterror',
  'soroban_contract',
];

const sorobanTypes = [
  'Address',
  'Bytes',
  'BytesN',
  'Env',
  'Error',
  'LedgerKey',
  'Map',
  'Result',
  'Symbol',
  'Vec',
];

const sorobanKeywords = [
  'async',
  'const',
  'crate',
  'else',
  'enum',
  'extern',
  'fn',
  'for',
  'if',
  'impl',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'trait',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
];

function position(lineNumber: number, column: number): monaco.IRange {
  return {
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column + 1,
  };
}

function analyzeBracketBalance(
  source: string,
  open: string,
  close: string,
  label: string
): Array<{
  message: string;
  severity: monaco.MarkerSeverity;
  range: monaco.IRange;
  code: string;
}> {
  const diagnostics: Array<{
    message: string;
    severity: monaco.MarkerSeverity;
    range: monaco.IRange;
    code: string;
  }> = [];
  const stack: Array<{ char: string; line: number; column: number }> = [];
  const lines = source.split('\n');

  lines.forEach((line, lineIndex) => {
    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const char = line[columnIndex];
      if (char === open) {
        stack.push({ char, line: lineIndex + 1, column: columnIndex + 1 });
      } else if (char === close) {
        const last = stack.pop();
        if (!last) {
          diagnostics.push({
            message: `Unmatched ${label} closing delimiter.`,
            severity: monaco.MarkerSeverity.Error,
            range: position(lineIndex + 1, columnIndex + 1),
            code: `soroban-unmatched-${label}-close`,
          });
        }
      }
    }
  });

  while (stack.length > 0) {
    const last = stack.pop()!;
    diagnostics.push({
      message: `Unclosed ${label} delimiter.`,
      severity: monaco.MarkerSeverity.Error,
      range: position(last.line, last.column),
      code: `soroban-unclosed-${label}-open`,
    });
  }

  return diagnostics;
}

export function analyzeSorobanSource(source: string) {
  const diagnostics: Array<{
    message: string;
    severity: monaco.MarkerSeverity;
    range: monaco.IRange;
    code: string;
  }> = [];

  const lines = source.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const customMacroMatch = line.match(/#\[\s*soroban_contract\s*\]/);
    if (customMacroMatch?.index !== undefined) {
      diagnostics.push({
        message: 'Use #[contract] instead of #[soroban_contract] for Soroban contracts.',
        severity: monaco.MarkerSeverity.Warning,
        range: position(lineNumber, customMacroMatch.index + 1),
        code: 'replace-soroban-contract',
      });
    }

    const storageMatch = line.match(/\benv\.storage\b(?!\s*\()/);
    if (storageMatch?.index !== undefined) {
      diagnostics.push({
        message: 'Call env.storage() before accessing instance, persistent, or temporary storage.',
        severity: monaco.MarkerSeverity.Error,
        range: position(lineNumber, storageMatch.index + 1),
        code: 'insert-storage-call',
      });
    }

    const invalidMacroMatch = line.match(/#\[\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\]/);
    if (invalidMacroMatch?.[1] && invalidMacroMatch[1].startsWith('soroban_')) {
      diagnostics.push({
        message: `Unknown Soroban attribute ${invalidMacroMatch[1]}.`,
        severity: monaco.MarkerSeverity.Warning,
        range: position(lineNumber, invalidMacroMatch.index! + 1),
        code: 'unknown-soroban-attribute',
      });
    }
  });

  diagnostics.push(
    ...analyzeBracketBalance(source, '{', '}', 'brace'),
    ...analyzeBracketBalance(source, '(', ')', 'parenthesis'),
    ...analyzeBracketBalance(source, '[', ']', 'bracket')
  );

  return diagnostics;
}

export function registerSorobanLanguage(monacoApi: typeof monaco) {
  if (languageRegistered) {
    return;
  }

  languageRegistered = true;

  monacoApi.languages.register({
    id: SOROBAN_LANGUAGE_ID,
    aliases: ['Soroban Rust', 'Soroban', 'soroban-rust'],
  });

  monacoApi.languages.setLanguageConfiguration(SOROBAN_LANGUAGE_ID, {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monacoApi.languages.setMonarchTokensProvider(SOROBAN_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.soroban',
    keywords: sorobanKeywords,
    macros: sorobanMacros,
    types: sorobanTypes,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [
          /#\[\s*(contract|contractimpl|contracttype|contractevent|contracterror|soroban_contract)\b[^\]]*\]/,
          'annotation',
        ],
        [/#\[\s*[a-zA-Z_][a-zA-Z0-9_]*\b[^\]]*\]/, 'annotation'],
        [/\b0x[0-9a-fA-F_]+\b/, 'number.hex'],
        [/\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b/, 'number'],
        [/".*?"/, 'string'],
        [/'(\\.|[^'])'/, 'string'],
        [/\b(?:true|false|None|Some|Ok|Err)\b/, 'keyword'],
        [new RegExp(`\\b(?:${sorobanKeywords.join('|')})\\b`), 'keyword'],
        [new RegExp(`\\b(?:${sorobanMacros.join('|')})\\b`), 'macro'],
        [new RegExp(`\\b(?:${sorobanTypes.join('|')})\\b`), 'type.identifier'],
        [/\b[a-z_][A-Za-z0-9_]*!(?=\s*\()/, 'macro'],
        [/\b[a-z_][A-Za-z0-9_]*(?=\s*\()/, 'function'],
        [/\b[A-Z][A-Za-z0-9_]*\b/, 'type.identifier'],
        [/[{}()\[\]<>]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/[+\-*/%=!&|^~?:]+/, 'operator'],
        [/[a-zA-Z_][A-Za-z0-9_]*/, 'identifier'],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  });
}

export function setSorobanDiagnostics(monacoApi: typeof monaco, model: monaco.editor.ITextModel) {
  const diagnostics = analyzeSorobanSource(model.getValue()).map((diagnostic) => ({
    ...diagnostic,
    startLineNumber: diagnostic.range.startLineNumber,
    startColumn: diagnostic.range.startColumn,
    endLineNumber: diagnostic.range.endLineNumber,
    endColumn: diagnostic.range.endColumn,
  }));

  monacoApi.editor.setModelMarkers(model, 'soroban', diagnostics);
}

export function registerSorobanCodeActions(monacoApi: typeof monaco) {
  if (codeActionsRegistered) {
    return;
  }

  codeActionsRegistered = true;

  monacoApi.languages.registerCodeActionProvider(SOROBAN_LANGUAGE_ID, {
    provideCodeActions(model, _range, context) {
      const actions = context.markers.flatMap((marker) => {
        const markerCode =
          typeof marker.code === 'string'
            ? marker.code
            : marker.code && typeof marker.code === 'object' && 'value' in marker.code
              ? String(marker.code.value)
              : '';

        if (markerCode === 'replace-soroban-contract') {
          const line = model.getLineContent(marker.startLineNumber);
          const match = line.match(/#\[\s*soroban_contract\s*\]/);
          if (!match || match.index === undefined) {
            return [];
          }

          const startColumn = match.index + 1;
          return [
            {
              title: 'Replace with #[contract]',
              diagnostics: [marker],
              kind: 'quickfix',
              edit: {
                edits: [
                  {
                    resource: model.uri,
                    textEdit: {
                      range: new monacoApi.Range(
                        marker.startLineNumber,
                        startColumn,
                        marker.startLineNumber,
                        startColumn + match[0].length
                      ),
                      text: '#[contract]',
                    },
                  },
                ],
              },
              isPreferred: true,
            },
          ];
        }

        if (markerCode === 'insert-storage-call') {
          const line = model.getLineContent(marker.startLineNumber);
          const match = line.match(/\benv\.storage\b/);
          if (!match || match.index === undefined) {
            return [];
          }

          const startColumn = match.index + 1;
          return [
            {
              title: 'Insert env.storage()',
              diagnostics: [marker],
              kind: 'quickfix',
              edit: {
                edits: [
                  {
                    resource: model.uri,
                    textEdit: {
                      range: new monacoApi.Range(
                        marker.startLineNumber,
                        startColumn,
                        marker.startLineNumber,
                        startColumn + 'env.storage'.length
                      ),
                      text: 'env.storage()',
                    },
                  },
                ],
              },
              isPreferred: true,
            },
          ];
        }

        return [];
      });

      return {
        actions,
        dispose: () => undefined,
      };
    },
  });
}

export function detectSorobanContext(source: string) {
  const trimmed = source.trim();
  const firstNonEmptyLine =
    source
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';

  return {
    hasSorobanImports: /use\s+soroban_sdk::/.test(source),
    usesEnvStorage: /env\.storage\s*\(\s*\)/.test(source),
    hasSorobanMacros:
      /#\[\s*(contract|contractimpl|contracttype|contractevent|contracterror|soroban_contract)\b/.test(
        source
      ),
    looksLikeContract:
      /pub\s+struct\s+[A-Z][A-Za-z0-9_]*/.test(source) ||
      /impl\s+[A-Z][A-Za-z0-9_]*/.test(source) ||
      firstNonEmptyLine.startsWith('#![no_std]') ||
      trimmed.includes('soroban_sdk'),
  };
}
