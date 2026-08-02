import * as monaco from 'monaco-editor';
import { detectSorobanContext } from './SorobanLanguage';

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

export function createSorobanLinter(options: SorobanLinterOptions): SorobanLinterInstance {
  const { model, monacoApi, debounceMs = 300 } = options;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function runLint() {
    if (disposed) return;

    try {
      const markers: monaco.editor.IMarkerData[] = [];
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

      monacoApi.editor.setModelMarkers(model, 'soroban-linter', markers);
    } catch {
      console.warn('Soroban linter failed to set markers');
    }
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
        debounceTimer = null;
      }
      contentListener.dispose();
      try {
        monacoApi.editor.setModelMarkers(model, 'soroban-linter', []);
      } catch {
        console.warn('Soroban linter failed to clear markers on dispose');
      }
    },
    run: runLint,
  };
}
