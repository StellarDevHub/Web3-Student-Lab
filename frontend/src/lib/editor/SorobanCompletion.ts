import * as monaco from 'monaco-editor';
import { SOROBAN_LANGUAGE_ID, detectSorobanContext } from './SorobanLanguage';

let completionRegistered = false;

type CompletionKindName = 'Method' | 'Keyword' | 'Struct';

interface CompletionTemplate {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
  kind: CompletionKindName;
  insertTextRules?: monaco.languages.CompletionItemInsertTextRule;
}

const envCompletions: CompletionTemplate[] = [
  {
    label: 'storage()',
    insertText: 'storage()',
    detail: 'Access contract storage',
    documentation: 'Returns the storage facade for instance, persistent, and temporary data.',
    kind: 'Method',
  },
  {
    label: 'ledger()',
    insertText: 'ledger()',
    detail: 'Inspect ledger state',
    documentation:
      'Provides access to ledger metadata such as sequence, timestamp, and network id.',
    kind: 'Method',
  },
  {
    label: 'events()',
    insertText: 'events()',
    detail: 'Emit contract events',
    documentation: 'Use this to publish Soroban events that clients can observe.',
    kind: 'Method',
  },
  {
    label: 'current_contract_address()',
    insertText: 'current_contract_address()',
    detail: 'Get the current contract address',
    documentation: 'Returns the address of the active contract invocation.',
    kind: 'Method',
  },
];

const storageCompletions: CompletionTemplate[] = [
  {
    label: 'instance()',
    insertText: 'instance()',
    detail: 'Access instance storage',
    documentation: 'Read and write per-contract-instance values.',
    kind: 'Method',
  },
  {
    label: 'persistent()',
    insertText: 'persistent()',
    detail: 'Access persistent storage',
    documentation: 'Persist values across ledger entries until cleared.',
    kind: 'Method',
  },
  {
    label: 'temporary()',
    insertText: 'temporary()',
    detail: 'Access temporary storage',
    documentation: 'Store short-lived values for the current ledger window.',
    kind: 'Method',
  },
  {
    label: 'get()',
    insertText: 'get(${1:key})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Read a value from storage',
    documentation: 'Returns the stored value for a key if it exists.',
    kind: 'Method',
  },
  {
    label: 'set()',
    insertText: 'set(${1:key}, ${2:value})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Write a value to storage',
    documentation: 'Stores a value under the provided key.',
    kind: 'Method',
  },
  {
    label: 'has()',
    insertText: 'has(${1:key})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Check if a value exists',
    documentation: 'Tests whether a key is present in storage.',
    kind: 'Method',
  },
  {
    label: 'remove()',
    insertText: 'remove(${1:key})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Remove a value from storage',
    documentation: 'Deletes a value from the selected storage bucket.',
    kind: 'Method',
  },
];

const sorobanCompletions: CompletionTemplate[] = [
  {
    label: 'contract',
    insertText: '#[contract]',
    detail: 'Soroban contract macro',
    documentation: 'Declares a contract and marks the struct as the contract entry point.',
    kind: 'Keyword',
  },
  {
    label: 'contractimpl',
    insertText: '#[contractimpl]',
    detail: 'Implement contract interface',
    documentation: 'Wraps the impl block that exposes contract methods to the host.',
    kind: 'Keyword',
  },
  {
    label: 'contracttype',
    insertText: '#[contracttype]',
    detail: 'Derive contract type encoding',
    documentation: 'Marks a type for Soroban contract serialization.',
    kind: 'Keyword',
  },
  {
    label: 'Address',
    insertText: 'Address',
    detail: 'Stellar address type',
    documentation: 'Represents an account or contract address in Soroban.',
    kind: 'Struct',
  },
  {
    label: 'Env',
    insertText: 'Env',
    detail: 'Soroban execution environment',
    documentation: 'The main entry point for storage, events, ledger data, and contract calls.',
    kind: 'Struct',
  },
  {
    label: 'Symbol',
    insertText: 'Symbol',
    detail: 'Short contract identifier',
    documentation: 'A compact symbolic key commonly used for storage and dispatch.',
    kind: 'Struct',
  },
];

function createCompletionItem(
  monacoApi: typeof monaco,
  item: CompletionTemplate,
  range: monaco.IRange
): monaco.languages.CompletionItem {
  return {
    label: item.label,
    kind: monacoApi.languages.CompletionItemKind[item.kind],
    insertText: item.insertText,
    insertTextRules: item.insertTextRules,
    detail: item.detail,
    documentation: item.documentation,
    sortText: item.label,
    range,
  };
}

export function registerSorobanCompletion(monacoApi: typeof monaco) {
  if (completionRegistered) {
    return;
  }

  completionRegistered = true;

  monacoApi.languages.registerCompletionItemProvider(SOROBAN_LANGUAGE_ID, {
    triggerCharacters: ['.', ':'],
    provideCompletionItems(model, position) {
      const wordUntil = model.getWordUntilPosition(position);
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const source = model.getValue();
      const context = detectSorobanContext(source);
      const suggestions: monaco.languages.CompletionItem[] = [];
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntil.startColumn,
        endColumn: wordUntil.endColumn,
      };

      if (/env\.$/.test(linePrefix)) {
        suggestions.push(
          ...envCompletions.map((item) => createCompletionItem(monacoApi, item, range))
        );
      }

      if (/env\.storage\(\)\.$/.test(linePrefix) || /storage\(\)\.$/.test(linePrefix)) {
        suggestions.push(
          ...storageCompletions.map((item) => createCompletionItem(monacoApi, item, range))
        );
      }

      if (
        /use\s+soroban_sdk::/.test(source) ||
        /soroban_sdk::/.test(linePrefix) ||
        context.looksLikeContract
      ) {
        suggestions.push(
          ...sorobanCompletions.map((item) => createCompletionItem(monacoApi, item, range))
        );
      }

      if (suggestions.length === 0) {
        suggestions.push(
          createCompletionItem(
            monacoApi,
            {
              label: 'storage()',
              insertText: 'storage()',
              detail: 'Access contract storage',
              documentation: 'Suggested when working with `env.` in Soroban contracts.',
              kind: 'Method',
            },
            range
          )
        );
      }

      return {
        suggestions,
      };
    },
  });
}
