import type * as monaco from 'monaco-editor';
import { SOROBAN_LANGUAGE_ID } from './SorobanLanguage';

let hoverRegistered = false;

const docs: Record<
  string,
  {
    title: string;
    signature: string;
    description: string;
    example: string;
  }
> = {
  Env: {
    title: 'Soroban `Env`',
    signature: 'struct Env',
    description:
      'The execution context for Soroban contracts. Use it to access storage, ledger metadata, events, and cross-contract calls.',
    example: `pub fn read_balance(env: Env, owner: Address) -> i128 {
    let balance = env
        .storage()
        .instance()
        .get(&owner)
        .unwrap_or(0);
    balance
}`,
  },
  Address: {
    title: 'Soroban `Address`',
    signature: 'struct Address',
    description:
      'Represents a Stellar account or contract address. Many contract methods accept it for authorization or lookup.',
    example: `pub fn require_admin(admin: Address) {
    admin.require_auth();
}`,
  },
  Symbol: {
    title: 'Soroban `Symbol`',
    signature: 'struct Symbol',
    description:
      'Compact identifier used for storage keys and contract dispatch. It keeps storage keys short and efficient.',
    example: `let key = Symbol::new(&env, "balance");
env.storage().instance().set(&key, &100i128);`,
  },
  instance: {
    title: 'Storage instance',
    signature: 'instance()',
    description:
      'Accesses instance storage, which is tied to the contract instance and is ideal for core state.',
    example: `let storage = env.storage().instance();
storage.set(&key, &value);`,
  },
  persistent: {
    title: 'Persistent storage',
    signature: 'persistent()',
    description:
      'Accesses persistent storage, which survives across ledger entries for long-lived contract state.',
    example: `env.storage().persistent().set(&key, &value);`,
  },
  temporary: {
    title: 'Temporary storage',
    signature: 'temporary()',
    description:
      'Accesses temporary storage, which is useful for short-lived contract state within a ledger window.',
    example: `env.storage().temporary().set(&key, &value);`,
  },
  get: {
    title: 'Storage get',
    signature: 'get(key)',
    description: 'Reads a value from Soroban storage.',
    example: `let value = env.storage().instance().get(&key).unwrap_or(0);`,
  },
  set: {
    title: 'Storage set',
    signature: 'set(key, value)',
    description: 'Writes a value to Soroban storage.',
    example: `env.storage().instance().set(&key, &value);`,
  },
  has: {
    title: 'Storage has',
    signature: 'has(key)',
    description: 'Checks whether a storage key exists.',
    example: `if env.storage().instance().has(&key) { /* ... */ }`,
  },
  remove: {
    title: 'Storage remove',
    signature: 'remove(key)',
    description: 'Removes a value from storage.',
    example: `env.storage().instance().remove(&key);`,
  },
  contractimpl: {
    title: '#[contractimpl]',
    signature: '#[contractimpl]',
    description:
      'Marks an impl block as a Soroban contract implementation and exposes its public methods to the host.',
    example: `#[contractimpl]
impl MyContract {
    pub fn hello(env: Env) {
        env.log().info("hello");
    }
}`,
  },
  contracttype: {
    title: '#[contracttype]',
    signature: '#[contracttype]',
    description:
      'Derives Soroban-compatible encoding for enum or struct types that cross the contract boundary.',
    example: `#[contracttype]
pub enum DataKey {
    Balance,
    Admin,
}`,
  },
  contract: {
    title: '#[contract]',
    signature: '#[contract]',
    description:
      'Declares a Soroban contract struct and connects the type to the generated contract metadata.',
    example: `#[contract]
pub struct TokenContract;`,
  },
  'env.storage()': {
    title: '`env.storage()`',
    signature: 'env.storage() -> Storage',
    description:
      'Returns the storage facade. Chain instance(), persistent(), or temporary() to choose the storage bucket.',
    example: `env.storage()
    .instance()
    .set(&Symbol::new(&env, "balance"), &100i128);`,
  },
  'storage().instance()': {
    title: '`storage().instance()`',
    signature: 'instance()',
    description:
      'Accesses instance storage, which is tied to the contract instance and is ideal for core state.',
    example: `let storage = env.storage().instance();
storage.set(&key, &value);`,
  },
};

function hoverMarkdown(
  monacoApi: typeof monaco,
  title: string,
  signature: string,
  description: string,
  example: string
) {
  return {
    value: [
      `### ${title}`,
      '',
      `**Signature:** \`${signature}\``,
      '',
      description,
      '',
      '#### Example',
      '```rust',
      example,
      '```',
    ].join('\n'),
  };
}

function registerHoverProvider(monacoApi: typeof monaco, languageId: string) {
  monacoApi.languages.registerHoverProvider(languageId, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      const line = model.getLineContent(position.lineNumber);
      const target =
        word?.word === 'env' && /env\.\s*storage\s*\(\s*\)/.test(line)
          ? 'env.storage()'
          : word?.word === 'storage' && /env\.\s*storage\s*\(\s*\)/.test(line)
            ? 'env.storage()'
            : word?.word === 'instance' && /storage\(\)\.\s*instance\s*\(\s*\)/.test(line)
              ? 'instance'
              : word?.word === 'persistent' && /storage\(\)\.\s*persistent\s*\(\s*\)/.test(line)
                ? 'persistent'
                : word?.word === 'temporary' && /storage\(\)\.\s*temporary\s*\(\s*\)/.test(line)
                  ? 'temporary'
                  : (word?.word ?? '');

      const entry = docs[target] ?? docs[word?.word ?? ''];
      if (!entry) {
        return null;
      }

      return {
        range: new monacoApi.Range(
          position.lineNumber,
          word?.startColumn ?? position.column,
          position.lineNumber,
          word?.endColumn ?? position.column
        ),
        contents: [
          hoverMarkdown(monacoApi, entry.title, entry.signature, entry.description, entry.example),
        ],
      };
    },
  });
}

export function registerSorobanHover(monacoApi: typeof monaco) {
  if (hoverRegistered) {
    return;
  }

  hoverRegistered = true;

  registerHoverProvider(monacoApi, SOROBAN_LANGUAGE_ID);
  registerHoverProvider(monacoApi, 'rust');
}
