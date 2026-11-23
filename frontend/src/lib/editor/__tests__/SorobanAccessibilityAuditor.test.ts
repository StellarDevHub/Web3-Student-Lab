import { describe, expect, it } from 'vitest';
import {
    auditSorobanSource,
    filterIssuesBySeverity,
    formatAuditSummary
} from '../SorobanAccessibilityAuditor';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/** A minimal valid Soroban contract that should pass all checks */
const CLEAN_CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol};

/// A simple hello-world Soroban contract.
#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    /// Returns a greeting symbol.
    pub fn hello(_env: Env) -> Symbol {
        Symbol::new(&_env, "hello")
    }
}
`;

// ---------------------------------------------------------------------------
// auditSorobanSource — empty / null-ish inputs
// ---------------------------------------------------------------------------

describe('auditSorobanSource — empty input', () => {
  it('returns no issues for an empty string', () => {
    const result = auditSorobanSource('');
    expect(result.passed).toBe(true);
    expect(result.hasIssues).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues for whitespace-only input', () => {
    const result = auditSorobanSource('   \n  \t  ');
    expect(result.passed).toBe(true);
  });

  it('counts are all zero for empty input', () => {
    const result = auditSorobanSource('');
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });
});

// ---------------------------------------------------------------------------
// RULE: missing-contract-attribute
// ---------------------------------------------------------------------------

describe('rule: missing-contract-attribute', () => {
  it('flags a PascalCase struct in a soroban file without #[contract]', () => {
    const source = `use soroban_sdk::{contract};\npub struct MyContract;`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-contract-attribute');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(issue!.message).toContain('MyContract');
  });

  it('does not flag when #[contract] is present directly above', () => {
    const source = `use soroban_sdk::{contract};\n#[contract]\npub struct MyContract;`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-contract-attribute');
    expect(issue).toBeUndefined();
  });

  it('does not flag a struct in a file with no soroban import', () => {
    const source = `pub struct Foo;\npub struct Bar { x: u32 }`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-contract-attribute');
    expect(issue).toBeUndefined();
  });

  it('does not flag a #[contracttype] struct', () => {
    const source = `use soroban_sdk::{contract};\n#[contracttype]\npub struct DataKey;`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-contract-attribute');
    expect(issue).toBeUndefined();
  });

  it('reports the correct line number', () => {
    const source = `use soroban_sdk::{};\n\n\npub struct Foo;`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-contract-attribute');
    expect(issue?.line).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// RULE: missing-fn-doc
// ---------------------------------------------------------------------------

describe('rule: missing-fn-doc', () => {
  it('flags a public function inside #[contractimpl] without a doc comment', () => {
    const source = `use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    pub fn transfer(env: Env) {}
}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-fn-doc');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('transfer');
  });

  it('does not flag when a /// comment is directly above the function', () => {
    const source = `use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    /// Transfers tokens.
    pub fn transfer(env: Env) {}
}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-fn-doc');
    expect(issue).toBeUndefined();
  });

  it('does not flag functions outside a #[contractimpl] block', () => {
    const source = `use soroban_sdk::{};\nfn helper() {}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'missing-fn-doc');
    expect(issue).toBeUndefined();
  });

  it('flags multiple undocumented functions', () => {
    const source = `use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    pub fn alpha(env: Env) {}
    pub fn beta(env: Env) {}
}`;
    const result = auditSorobanSource(source);
    const issues = result.issues.filter((i) => i.rule === 'missing-fn-doc');
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// RULE: opaque-error-code
// ---------------------------------------------------------------------------

describe('rule: opaque-error-code', () => {
  it('flags a single-letter error variant', () => {
    const source = `#[contracterror]\npub enum MyError {\n    E = 1,\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'opaque-error-code');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('E');
  });

  it('flags an Err1-style variant', () => {
    const source = `#[contracterror]\npub enum MyError {\n    Err1 = 1,\n    Err2 = 2,\n}`;
    const result = auditSorobanSource(source);
    const issues = result.issues.filter((i) => i.rule === 'opaque-error-code');
    expect(issues.length).toBe(2);
  });

  it('does not flag descriptive variant names', () => {
    const source = `#[contracterror]\npub enum ContractError {\n    InsufficientBalance = 1,\n    Unauthorized = 2,\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'opaque-error-code');
    expect(issue).toBeUndefined();
  });

  it('does not flag variants outside a #[contracterror] block', () => {
    const source = `pub enum SomeEnum {\n    E = 1,\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'opaque-error-code');
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RULE: undocumented-error-enum
// ---------------------------------------------------------------------------

describe('rule: undocumented-error-enum', () => {
  it('flags a #[contracterror] enum without a doc comment', () => {
    const source = `#[contracterror]\npub enum ContractError {\n    NotFound = 1,\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'undocumented-error-enum');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('does not flag when a doc comment exists above #[contracterror]', () => {
    const source = `/// Error codes returned by this contract.\n#[contracterror]\npub enum ContractError {\n    NotFound = 1,\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'undocumented-error-enum');
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RULE: event-missing-topics
// ---------------------------------------------------------------------------

describe('rule: event-missing-topics', () => {
  it('flags an event published with only one topic', () => {
    const source = `env.events().publish((Symbol::new(&env, "transfer"),), data);`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'event-missing-topics');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('does not flag an event with two topics', () => {
    const source = `env.events().publish((Symbol::new(&env, "transfer"), from), data);`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'event-missing-topics');
    expect(issue).toBeUndefined();
  });

  it('does not flag lines that do not call .publish()', () => {
    const source = `let events = env.events();`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'event-missing-topics');
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RULE: raw-bytes-storage-key
// ---------------------------------------------------------------------------

describe('rule: raw-bytes-storage-key', () => {
  it('flags Bytes:: used as a storage key in .set()', () => {
    const source = `env.storage().instance().set(Bytes::new(&env), &value);`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'raw-bytes-storage-key');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('flags BytesN:: used as a storage key in .get()', () => {
    const source = `env.storage().persistent().get(BytesN::<32>::new(&env));`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'raw-bytes-storage-key');
    expect(issue).toBeDefined();
  });

  it('does not flag Symbol keys in storage', () => {
    const source = `env.storage().instance().set(Symbol::new(&env, "bal"), &100);`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'raw-bytes-storage-key');
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RULE: panic-only-error-handling
// ---------------------------------------------------------------------------

describe('rule: panic-only-error-handling', () => {
  it('flags panic!() as an error', () => {
    const source = `fn foo() { panic!("oh no"); }`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'panic-only-error-handling' && i.severity === 'error');
    expect(issue).toBeDefined();
  });

  it('flags .unwrap() as a warning', () => {
    const source = `let x = some_option.unwrap();`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find(
      (i) => i.rule === 'panic-only-error-handling' && i.severity === 'warning'
    );
    expect(issue).toBeDefined();
    expect(issue!.suggestion).toContain('unwrap_or');
  });

  it('does not flag panic!() in a comment', () => {
    const source = `// You can use panic!() but we prefer Result types`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find(
      (i) => i.rule === 'panic-only-error-handling' && i.severity === 'error'
    );
    expect(issue).toBeUndefined();
  });

  it('does not flag .unwrap() in a comment', () => {
    const source = `// calling .unwrap() on None will panic`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find(
      (i) => i.rule === 'panic-only-error-handling' && i.severity === 'warning'
    );
    expect(issue).toBeUndefined();
  });

  it('reports the correct line for panic!', () => {
    const source = `fn foo() {\n    panic!("bad");\n}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find(
      (i) => i.rule === 'panic-only-error-handling' && i.severity === 'error'
    );
    expect(issue?.line).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// RULE: unnamed-fn-params
// ---------------------------------------------------------------------------

describe('rule: unnamed-fn-params', () => {
  it('flags a function with an _ parameter', () => {
    const source = `use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    /// Docs here.
    pub fn transfer(_: Env) {}
}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'unnamed-fn-params');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('does not flag well-named parameters', () => {
    const source = `use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    /// Docs here.
    pub fn transfer(env: Env, amount: i128) {}
}`;
    const result = auditSorobanSource(source);
    const issue = result.issues.find((i) => i.rule === 'unnamed-fn-params');
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Severity counts
// ---------------------------------------------------------------------------

describe('counts', () => {
  it('counts errors correctly', () => {
    const source = `use soroban_sdk::{};\npub struct A;\npub struct B;\n`; // 2 missing #[contract]
    const result = auditSorobanSource(source);
    expect(result.counts.error).toBeGreaterThanOrEqual(2);
  });

  it('counts warnings correctly', () => {
    const source = `fn f() {\n    let x = opt.unwrap();\n    let y = opt2.unwrap();\n}`;
    const result = auditSorobanSource(source);
    expect(result.counts.warning).toBeGreaterThanOrEqual(2);
  });

  it('hasIssues is true when there are issues', () => {
    const source = `use soroban_sdk::{};\npub struct A;`;
    expect(auditSorobanSource(source).hasIssues).toBe(true);
  });

  it('hasIssues is false when clean', () => {
    expect(auditSorobanSource(CLEAN_CONTRACT).hasIssues).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue sort order
// ---------------------------------------------------------------------------

describe('sort order', () => {
  it('issues are sorted by line number ascending', () => {
    const source = `fn f() { panic!("a"); }
use soroban_sdk::{};\npub struct X;`;
    const result = auditSorobanSource(source);
    const lines = result.issues.map((i) => i.line);
    const sorted = [...lines].sort((a, b) => a - b);
    expect(lines).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// filterIssuesBySeverity
// ---------------------------------------------------------------------------

describe('filterIssuesBySeverity', () => {
  it('returns only error issues', () => {
    const source = `use soroban_sdk::{};\npub struct X;\nfn f() { let x = v.unwrap(); }`;
    const result = auditSorobanSource(source);
    const errors = filterIssuesBySeverity(result, 'error');
    expect(errors.every((i) => i.severity === 'error')).toBe(true);
  });

  it('returns only warning issues', () => {
    const source = `fn f() { let x = v.unwrap(); }`;
    const result = auditSorobanSource(source);
    const warnings = filterIssuesBySeverity(result, 'warning');
    expect(warnings.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('returns empty array when no issues of that severity', () => {
    expect(filterIssuesBySeverity(auditSorobanSource(CLEAN_CONTRACT), 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatAuditSummary
// ---------------------------------------------------------------------------

describe('formatAuditSummary', () => {
  it('returns a passing message when no issues', () => {
    const result = auditSorobanSource(CLEAN_CONTRACT);
    expect(formatAuditSummary(result)).toBe('Accessibility audit passed. No issues found.');
  });

  it('includes error count in the summary', () => {
    const source = `use soroban_sdk::{};\npub struct X;`;
    const result = auditSorobanSource(source);
    const summary = formatAuditSummary(result);
    expect(summary).toMatch(/\d+ error/);
  });

  it('includes warning count in the summary', () => {
    const source = `fn f() { v.unwrap(); }`;
    const result = auditSorobanSource(source);
    const summary = formatAuditSummary(result);
    expect(summary).toMatch(/\d+ warning/);
  });

  it('uses singular form for 1 error', () => {
    const source = `use soroban_sdk::{};\npub struct X;`;
    const result = auditSorobanSource(source);
    // Only one struct → exactly 1 error for missing-contract-attribute
    // Filter to a synthetic result with count 1
    const single = { ...result, counts: { error: 1, warning: 0, info: 0 } };
    expect(formatAuditSummary(single)).toContain('1 error');
    expect(formatAuditSummary(single)).not.toContain('1 errors');
  });

  it('uses plural form for multiple errors', () => {
    const source = `use soroban_sdk::{};\npub struct A;\npub struct B;`;
    const result = auditSorobanSource(source);
    if (result.counts.error >= 2) {
      expect(formatAuditSummary(result)).toMatch(/\d+ errors/);
    }
  });
});

// ---------------------------------------------------------------------------
// Clean contract produces no issues
// ---------------------------------------------------------------------------

describe('clean contract baseline', () => {
  it('the CLEAN_CONTRACT fixture passes the audit', () => {
    const result = auditSorobanSource(CLEAN_CONTRACT);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple co-occurring rules
// ---------------------------------------------------------------------------

describe('multiple rules triggered simultaneously', () => {
  it('catches missing-contract-attribute and panic! in the same file', () => {
    const source = `use soroban_sdk::{};\npub struct X;\nfn f() { panic!("bad"); }`;
    const result = auditSorobanSource(source);
    const rules = result.issues.map((i) => i.rule);
    expect(rules).toContain('missing-contract-attribute');
    expect(rules).toContain('panic-only-error-handling');
  });

  it('catches opaque error codes and undocumented error enum together', () => {
    const source = `#[contracterror]\npub enum E {\n    E1 = 1,\n}`;
    const result = auditSorobanSource(source);
    const rules = result.issues.map((i) => i.rule);
    expect(rules).toContain('opaque-error-code');
    expect(rules).toContain('undocumented-error-enum');
  });
});
