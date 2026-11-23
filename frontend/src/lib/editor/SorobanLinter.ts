import * as monaco from 'monaco-editor';
import { detectSorobanContext } from './SorobanLanguage';
import { lintSorobanContract, type Diagnostic, type DiagnosticFix } from './sorobanLintRules';

const STD_SUGGESTIONS: Record<string, string> = {
  'std::collections::HashMap': 'soroban_sdk::Map',
  'std::collections::HashSet': 'soroban_sdk::Vec',
  'std::vec::Vec': 'soroban_sdk::Vec',
};

export interface SorobanLinterOptions {
  model: monaco.editor.ITextModel;
  monacoApi: typeof monaco;
  debounceMs?: number;
}

export interface SorobanLinterInstance {
  dispose: () => void;
  run: () => void;
}

function severityToMarker(severity: Diagnostic['severity']): monaco.MarkerSeverity {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'info':
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Warning;
  }
}

export function createSorobanLinter(options: SorobanLinterOptions): SorobanLinterInstance {
  const { model, monacoApi, debounceMs = 300 } = options;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const fixMap = new Map<string, DiagnosticFix>();
  let codeActionDisposable: { dispose: () => void } | null = null;

  function runLint() {
    if (disposed) return;

    try {
      const markers: monaco.editor.IMarkerData[] = [];
      fixMap.clear();
      const source = model.getValue();
      const context = detectSorobanContext(source);
      const lines = source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        if (context.looksLikeContract && /pub\s+struct\s+[A-Z][A-Za-z0-9_]*\s*[;{]/.test(line)) {
          let foundContractAttr = false;
          for (let j = i - 1; j >= 0; j--) {
            const prevLine = lines[j].trim();
            if (prevLine === '' || prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*')) {
              continue;
            }
            if (/#\[\s*contract\s*\]/.test(prevLine)) {
              foundContractAttr = true;
            }
            break;
          }
          if (!foundContractAttr) {
            markers.push({
              message:
                "Missing #[contract] attribute above contract struct. Add #[contract] before the struct declaration.",
              severity: monacoApi.MarkerSeverity.Warning,
              startLineNumber: lineNumber,
              endLineNumber: lineNumber,
              startColumn: 1,
              endColumn: line.length + 1,
            });
          }
        }

        const stdMatch = line.match(/\bstd::[\w:]+/);
        if (stdMatch) {
          const fullPath = stdMatch[0];
          const suggestion = STD_SUGGESTIONS[fullPath] ?? 'soroban_sdk equivalents';
          markers.push({
            message: `'${fullPath}' is unavailable in no_std Soroban contracts. Use ${suggestion} instead.`,
            severity: monacoApi.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: (stdMatch.index ?? 0) + 1,
            endColumn: (stdMatch.index ?? 0) + fullPath.length + 1,
          });
        }

        if (line.includes('use std::')) {
          const useMatch = line.match(/use\s+std::[\w:]+/);
          if (useMatch) {
            markers.push({
              message: "std:: imports are unavailable in no_std Soroban contracts. Import from soroban_sdk instead.",
              severity: monacoApi.MarkerSeverity.Error,
              startLineNumber: lineNumber,
              endLineNumber: lineNumber,
              startColumn: 1,
              endColumn: line.length + 1,
            });
          }
        }
      }

      // Static-analysis rules (require_auth / overflow / storage eviction).
      const diagnostics = lintSorobanContract(source, {
        looksLikeContract: context.looksLikeContract,
      });
      for (const d of diagnostics) {
        const marker: monaco.editor.IMarkerData = {
          message: d.message,
          severity: severityToMarker(d.severity),
          startLineNumber: d.line,
          endLineNumber: d.line,
          startColumn: d.column,
          endColumn: d.endColumn,
          code: d.code,
          source: 'soroban-linter',
        };
        markers.push(marker);
        if (d.fix) {
          fixMap.set(`${d.line}:${d.column}:${d.code}`, d.fix);
        }
      }

      monacoApi.editor.setModelMarkers(model, 'soroban-linter', markers);
    } catch {
      console.warn('Soroban linter failed to set markers');
    }
  }

  // Register a 1-click quick-fix provider for the static-analysis diagnostics.
  try {
    codeActionDisposable = monacoApi.languages.registerCodeActionProvider('rust', {
      provideCodeActions(modelArg, _range, ctx) {
        if (modelArg !== model) return { actions: [], dispose: () => {} };
        const actions: monaco.languages.CodeAction[] = [];
        for (const marker of ctx.markers) {
          if (marker.source !== 'soroban-linter' || marker.code == null) continue;
          const key = `${marker.startLineNumber}:${marker.startColumn}:${marker.code}`;
          const fix = fixMap.get(key);
          if (!fix) continue;
          actions.push({
            title: fix.title,
            kind: 'quickfix',
            isPreferred: true,
            edit: {
              edits: [
                {
                  resource: model.uri,
                  versionId: model.getVersionId(),
                  edits: [
                    {
                      range: new monacoApi.Range(
                        fix.range.startLine,
                        fix.range.startColumn,
                        fix.range.endLine,
                        fix.range.endColumn
                      ),
                      text: fix.newText,
                    },
                  ],
                },
              ],
            },
          });
        }
        return { actions, dispose: () => {} };
      },
    });
  } catch {
    codeActionDisposable = null;
  }

  const contentListener = model.onDidChangeContent(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runLint, debounceMs);
  });

  runLint();

  return {
    dispose: () => {
      disposed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      contentListener.dispose();
      codeActionDisposable?.dispose();
      codeActionDisposable = null;
      try {
        monacoApi.editor.setModelMarkers(model, 'soroban-linter', []);
      } catch {
        console.warn('Soroban linter failed to clear markers on dispose');
      }
    },
    run: runLint,
  };
}
