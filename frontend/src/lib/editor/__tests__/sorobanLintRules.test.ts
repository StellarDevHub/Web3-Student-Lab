import { describe, expect, it } from 'vitest';
import { lintSorobanContract } from '@/lib/editor/sorobanLintRules';

const CTX = { looksLikeContract: true };

describe('soroban static-analysis rules', () => {
  it('flags missing require_auth on storage-mutating functions', () => {
    const src = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    pub fn set_value(env: Env, sender: Address, v: u32) {
        env.storage().persistent().set(&1, &v);
    }
}`;
    const diags = lintSorobanContract(src, CTX);
    const auth = diags.find((d) => d.code === 'missing-require-auth');
    expect(auth).toBeDefined();
    expect(auth?.fix?.newText).toContain('sender.require_auth();');
  });

  it('does not flag functions that already call require_auth', () => {
    const src = `pub fn set_value(env: Env, sender: Address, v: u32) {
        sender.require_auth();
        env.storage().persistent().set(&1, &v);
    }`;
    const diags = lintSorobanContract(src, CTX);
    expect(diags.find((d) => d.code === 'missing-require-auth')).toBeUndefined();
  });

  it('flags unchecked integer arithmetic', () => {
    const src = `#[contract]
pub struct C;
impl C {
    pub fn add(env: Env, a: u32, b: u32) -> u32 {
        let c = a + b;
        c
    }
}`;
    const diags = lintSorobanContract(src, CTX);
    expect(diags.find((d) => d.code === 'integer-overflow')).toBeDefined();
  });

  it('does not flag checked arithmetic', () => {
    const src = `pub fn add(env: Env, a: u32, b: u32) -> u32 {
        a.checked_add(b).expect("overflow")
    }`;
    const diags = lintSorobanContract(src, CTX);
    expect(diags.find((d) => d.code === 'integer-overflow')).toBeUndefined();
  });

  it('flags un-bumped persistent storage writes', () => {
    const src = `pub fn save(env: Env, v: u32) {
        env.storage().persistent().set(&1, &v);
    }`;
    const diags = lintSorobanContract(src, CTX);
    expect(diags.find((d) => d.code === 'unbumped-storage')).toBeDefined();
  });

  it('does not flag storage writes that bump ttl', () => {
    const src = `pub fn save(env: Env, v: u32) {
        env.storage().instance().extend_ttl(100, 1000);
        env.storage().persistent().set(&1, &v);
    }`;
    const diags = lintSorobanContract(src, CTX);
    expect(diags.find((d) => d.code === 'unbumped-storage')).toBeUndefined();
  });

  it('returns no diagnostics for non-contract sources', () => {
    const src = `fn main() { let x = 1 + 2; }`;
    expect(lintSorobanContract(src, { looksLikeContract: false })).toHaveLength(0);
  });
});
