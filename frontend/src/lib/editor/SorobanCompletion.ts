import * as monaco from 'monaco-editor';
import { SOROBAN_LANGUAGE_ID, detectSorobanContext } from './SorobanLanguage';

let completionRegistered = false;

type CompletionKindName = 'Method' | 'Keyword' | 'Struct' | 'Snippet';

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
  {
    label: 'invoke_contract()',
    insertText: 'invoke_contract(${1:address}, ${2:func_name}, ${3:args})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Call another contract',
    documentation: 'Invokes a function on another Soroban contract by address.',
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
  {
    label: 'Vec',
    insertText: 'Vec',
    detail: 'Soroban vector type',
    documentation: 'A vector type from the Soroban SDK for ordered collections.',
    kind: 'Struct',
  },
  {
    label: 'Map',
    insertText: 'Map',
    detail: 'Soroban map type',
    documentation: 'A map type from the Soroban SDK for key-value storage.',
    kind: 'Struct',
  },
];

const snippetCompletions: CompletionTemplate[] = [
  {
    label: 'contract struct',
    insertText: '#[contract]\npub struct ${1:ContractName};',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Contract struct boilerplate',
    documentation: 'Creates a Soroban contract struct with the #[contract] attribute.',
    kind: 'Snippet',
  },
  {
    label: 'contractimpl impl',
    insertText: '#[contractimpl]\nimpl ${1:ContractName} {\n\t$0\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Impl block boilerplate',
    documentation: 'Creates a #[contractimpl] impl block for a Soroban contract.',
    kind: 'Snippet',
  },
  {
    label: 'soroban_sdk import',
    insertText: 'use soroban_sdk::{contract, contractimpl, Env, Address, Symbol, Vec, Map};',
    detail: 'Common Soroban imports',
    documentation: 'Imports common Soroban SDK types and macros.',
    kind: 'Snippet',
  },
  {
    label: 'log!',
    insertText: 'log!(&${1:env}, "${2:message}")',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Log helper macro',
    documentation: 'Logs a message using the Soroban environment logger.',
    kind: 'Snippet',
  },
  {
    label: 'storage chain',
    insertText: 'env.storage().instance().get(${1:key})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Storage access chain',
    documentation: 'Access instance storage from env and read a value.',
    kind: 'Snippet',
  },
  {
    label: 'storage set chain',
    insertText: 'env.storage().instance().set(${1:key}, ${2:value})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Storage write chain',
    documentation: 'Access instance storage from env and write a value.',
    kind: 'Snippet',
  },
  {
    label: 'storage has chain',
    insertText: 'env.storage().instance().has(${1:key})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Storage existence check',
    documentation: 'Check if a key exists in instance storage.',
    kind: 'Snippet',
  },
];

const advancedMacroCompletions: CompletionTemplate[] = [
  {
    label: '#[contract] full scaffold',
    insertText: '#[contract]\npub struct ${1:ContractName};\n\n#[contracterror]\n#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]\n#[repr(u32)]\npub enum Error {\n\t${2:AlreadyInitialized = 1},\n\t${3:NotFound = 2},\n}\n\n#[contractimpl]\nimpl ${1:ContractName} {\n\tpub fn new(env: Env) -> ${1:ContractName} {\n\t\t${1:ContractName}\n\t}\n\t\n\tpub fn ${4:method_name}(env: Env, ${5:param}: ${6:param_type}) -> ${7:return_type} {\n\t\t$0\n\t}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Full contract scaffold with error enum',
    documentation: 'Creates a complete Soroban contract with #[contract], #[contracterror], and #[contractimpl] with Env injection and error handling.',
    kind: 'Snippet',
  },
  {
    label: '#[contractimpl] with Env',
    insertText: '#[contractimpl]\nimpl ${1:ContractName} {\n\tpub fn ${2:method_name}(env: Env, ${3:param}: ${4:param_type}) -> Result<${5:return_type}, Error> {\n\t\t$0\n\t}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Contract impl with Env and error handling',
    documentation: 'Creates a #[contractimpl] impl block with methods that include Env injection and Result<T, Error> error handling for Soroban v22.',
    kind: 'Snippet',
  },
  {
    label: '#[contracterror] enum',
    insertText: '#[contracterror]\n#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]\n#[repr(u32)]\npub enum Error {\n\t${1:ErrorName = 1},\n\t${2:AnotherError = 2},\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Contract error enum',
    documentation: 'Creates a #[contracterror] enum with proper derives for Soroban error handling.',
    kind: 'Snippet',
  },
  {
    label: 'constructor with Env',
    insertText: 'pub fn new(env: Env) -> ${1:ContractName} {\n\t${1:ContractName}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Contract constructor with Env',
    documentation: 'Creates a constructor function with Env parameter for contract initialization.',
    kind: 'Snippet',
  },
  {
    label: 'method with error handling',
    insertText: 'pub fn ${1:method_name}(env: Env, ${2:param}: ${3:param_type}) -> Result<${4:return_type}, Error> {\n\t$0\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'Method with Result and Error',
    documentation: 'Creates a method that returns Result<T, Error> for proper error handling in Soroban contracts.',
    kind: 'Snippet',
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

function registerProvider(monacoApi: typeof monaco, languageId: string) {
  monacoApi.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':'],
    provideCompletionItems(model, position) {
      try {
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

        if (context.looksLikeContract) {
          suggestions.push(
            ...snippetCompletions.map((item) => createCompletionItem(monacoApi, item, range))
          );
        }

        // Advanced macro completions triggered by typing #[contract, #[contractimpl, or #[contracterror
        if (/#\[contract/.test(linePrefix) || /#\[/i.test(linePrefix)) {
          suggestions.push(
            ...advancedMacroCompletions.map((item) => createCompletionItem(monacoApi, item, range))
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

        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    },
  });
}

export function registerSorobanCompletion(monacoApi: typeof monaco) {
  if (completionRegistered) {
    return;
  }

  completionRegistered = true;

  registerProvider(monacoApi, SOROBAN_LANGUAGE_ID);
  registerProvider(monacoApi, 'rust');
}
