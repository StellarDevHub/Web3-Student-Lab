import { describe, expect, it, beforeEach } from '@jest/globals';
import { PolicyEngine } from '../src/services/policy/PolicyEngine.js';
import { POLICY_VERSION, Policy, PolicyRule } from '../src/services/policy/types.js';
import { sorobanSecurityPolicy, SOROBAN_SECURITY_POLICY_ID } from '../src/services/policy/definitions.js';
import { resetDLQStore } from '../src/services/dlq.service.js';

describe('Policy Engine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    PolicyEngine.resetInstance();
    engine = new PolicyEngine();
  });

  describe('Policy Loading & Management', () => {
    it('loads the default Soroban security policy on construction', () => {
      const policies = engine.getAllPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].id).toBe(SOROBAN_SECURITY_POLICY_ID);
    });

    it('retrieves a policy by ID', () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID);
      expect(policy).toBeDefined();
      expect(policy?.name).toBe('Soroban Security Baseline');
    });

    it('returns undefined for unknown policy ID', () => {
      expect(engine.getPolicy('nonexistent')).toBeUndefined();
    });

    it('returns all loaded policies', () => {
      const all = engine.getAllPolicies();
      expect(all.length).toBeGreaterThan(0);
    });

    it('returns only enabled policies by default', () => {
      const enabled = engine.getEnabledPolicies();
      expect(enabled.length).toBe(1);
      expect(enabled[0].enabled).not.toBe(false);
    });

    it('loads a custom policy', () => {
      const customRule: PolicyRule = {
        id: 'custom-rule',
        name: 'Custom Rule',
        description: 'A custom rule for testing',
        pattern: /custom_pattern/,
        severity: 'high',
        message: 'Custom pattern detected',
        remediation: 'Remove custom pattern',
      };

      const customPolicy: Policy = {
        id: 'custom-policy',
        name: 'Custom Policy',
        version: '2.0.0',
        rules: [customRule],
        enabled: true,
      };

      engine.loadPolicy(customPolicy);
      expect(engine.getPolicy('custom-policy')).toBeDefined();
      expect(engine.getAllPolicies()).toHaveLength(2);
    });

    it('rejects invalid policy on load', () => {
      const invalidPolicy: Policy = {
        id: '',
        name: 'Invalid',
        version: '1.0.0',
        rules: [],
      };

      expect(() => engine.loadPolicy(invalidPolicy)).toThrow('Invalid policy');
    });
  });

  describe('Policy Version', () => {
    it('returns the current policy version', () => {
      expect(engine.getPolicyVersion()).toBe(POLICY_VERSION);
    });

    it('default policy version matches definitions', () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID);
      expect(policy?.version).toBe('1.0.0');
    });
  });

  describe('Policy Validation', () => {
    it('validates a correct policy', () => {
      const result = engine.validatePolicy(sorobanSecurityPolicy);
      expect(result.valid).toBe(true);
    });

    it('rejects policy without id', () => {
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, id: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('id');
    });

    it('rejects policy without name', () => {
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, name: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('rejects policy without version', () => {
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, version: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('rejects policy with empty rules', () => {
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, rules: [] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rule');
    });

    it('rejects rule without valid pattern', () => {
      const badRule: PolicyRule = {
        id: 'bad',
        name: 'Bad',
        pattern: 'not-a-regex' as any,
        severity: 'high',
        message: 'msg',
        remediation: 'fix',
      };
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, rules: [badRule] });
      expect(result.valid).toBe(false);
    });

    it('rejects rule with invalid severity', () => {
      const badRule: PolicyRule = {
        id: 'bad',
        name: 'Bad',
        pattern: /test/,
        severity: 'extreme' as any,
        message: 'msg',
        remediation: 'fix',
      };
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, rules: [badRule] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('severity');
    });

    it('rejects rule without message', () => {
      const badRule: PolicyRule = {
        id: 'bad',
        name: 'Bad',
        pattern: /test/,
        severity: 'high',
        message: '',
        remediation: 'fix',
      };
      const result = engine.validatePolicy({ ...sorobanSecurityPolicy, rules: [badRule] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('message');
    });
  });

  describe('Policy Evaluation', () => {
    const vulnerableCode = `use std::collections::HashMap;
pub fn bad() { panic!("fail"); }`;

    const safeCode = `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol, Env, Symbol};`;

    it('evaluates source code against a policy and returns findings', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({ sourceCode: vulnerableCode, policy });

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some(f => f.rule === 'std-import')).toBe(true);
      expect(result.findings.some(f => f.rule === 'panic-usage')).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('returns no findings for safe code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({ sourceCode: safeCode, policy });

      expect(result.findings).toHaveLength(0);
      expect(result.score).toBe(100);
      expect(result.summary).toContain('No vulnerabilities');
    });

    it('includes policy metadata in result', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({ sourceCode: safeCode, policy });

      expect(result.policy.id).toBe(policy.id);
      expect(result.policy.name).toBe(policy.name);
      expect(result.policy.version).toBe(policy.version);
    });

    it('includes scannedAt timestamp', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({ sourceCode: safeCode, policy });

      expect(result.scannedAt).toBeDefined();
      expect(new Date(result.scannedAt).getTime()).not.toBeNaN();
    });

    it('rejects empty source code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      await expect(engine.evaluatePolicy({ sourceCode: '', policy })).rejects.toThrow(
        'Invalid evaluation request'
      );
    });

    it('rejects whitespace-only source code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      await expect(engine.evaluatePolicy({ sourceCode: '   ', policy })).rejects.toThrow(
        'Invalid evaluation request'
      );
    });

    it('rejects non-string source code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      await expect(
        engine.evaluatePolicy({ sourceCode: 123 as any, policy })
      ).rejects.toThrow('Invalid evaluation request');
    });

    it('rejects oversized source code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const longCode = 'x'.repeat(50001);
      await expect(engine.evaluatePolicy({ sourceCode: longCode, policy })).rejects.toThrow(
        'exceeds maximum length'
      );
    });
  });

  describe('Deterministic Scanning', () => {
    const vulnerableCode = `use std::collections::HashMap;
pub fn bad() { panic!("fail"); }`;

    it('produces identical findings for the same input', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result1 = await engine.evaluatePolicy({ sourceCode: vulnerableCode, policy });
      const result2 = await engine.evaluatePolicy({ sourceCode: vulnerableCode, policy });

      expect(result1.findings).toEqual(result2.findings);
      expect(result1.score).toBe(result2.score);
    });

    it('finding IDs are deterministic (no random components)', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result1 = await engine.evaluatePolicy({ sourceCode: vulnerableCode, policy });
      const result2 = await engine.evaluatePolicy({ sourceCode: vulnerableCode, policy });

      for (let i = 0; i < result1.findings.length; i++) {
        expect(result1.findings[i]?.id).toBe(result2.findings[i]?.id);
      }
    });

    it('findings are ordered by line number', async () => {
      const code = `use std::collections::HashMap;
unsafe { let x = 1; }
panic!("fail");`;
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({ sourceCode: code, policy });

      for (let i = 1; i < result.findings.length; i++) {
        expect(result.findings[i]!.line).toBeGreaterThanOrEqual(result.findings[i - 1]!.line);
      }
    });
  });

  describe('Score Calculation', () => {
    it('starts at 100 for clean code', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({
        sourceCode: `#![no_std]\nuse soroban_sdk::{Env, Symbol};`,
        policy,
      });
      expect(result.score).toBe(100);
    });

    it('deducts 50 for a critical finding', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({
        sourceCode: 'use std::collections::HashMap;',
        policy,
      });
      expect(result.score).toBe(50);
    });

    it('deducts 30 for a high finding', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({
        sourceCode: 'pub struct MyStruct {',
        policy,
      });
      expect(result.score).toBe(70);
    });

    it('deducts 15 for a medium finding', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({
        sourceCode: 'panic!("fail");',
        policy,
      });
      expect(result.score).toBe(85);
    });

    it('deducts 5 for a low finding', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result = await engine.evaluatePolicy({
        sourceCode: 'let x = 5 as i128;',
        policy,
      });
      expect(result.score).toBe(95);
    });

    it('clamps score to 0', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const code = `use std::collections::HashMap;
unsafe { let x = 1; }
use std::vec::Vec;
unsafe { let y = 2; }`;
      const result = await engine.evaluatePolicy({ sourceCode: code, policy });
      expect(result.score).toBe(0);
    });
  });

  describe('Evaluate All Policies', () => {
    it('evaluates all enabled policies', async () => {
      const results = await engine.evaluateAllPolicies('use std::collections::HashMap;');
      expect(results.length).toBe(1);
      expect(results[0].findings.length).toBeGreaterThan(0);
    });

    it('throws when no enabled policies', () => {
      const strictEngine = new PolicyEngine({ enabledPolicies: ['nonexistent'] });
      expect(strictEngine.getEnabledPolicies()).toHaveLength(0);
    });
  });

  describe('Merge & Best Result', () => {
    it('merges results from multiple policies', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result1 = await engine.evaluatePolicy({ sourceCode: 'use std::vec::Vec;', policy });
      const result2 = await engine.evaluatePolicy({ sourceCode: 'panic!("fail");', policy });

      const merged = engine.mergeResults([result1, result2]);
      expect(merged.findings.length).toBeGreaterThan(0);
      expect(merged.score).toBeLessThan(100);
    });

    it('deduplicates findings on merge', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const code = 'use std::collections::HashMap;';
      const result1 = await engine.evaluatePolicy({ sourceCode: code, policy });
      const result2 = await engine.evaluatePolicy({ sourceCode: code, policy });

      const merged = engine.mergeResults([result1, result2]);
      expect(merged.findings).toHaveLength(1);
    });

    it('returns best (highest scoring) result', async () => {
      const policy = engine.getPolicy(SOROBAN_SECURITY_POLICY_ID)!;
      const result1 = await engine.evaluatePolicy({ sourceCode: 'use std::vec::Vec;', policy });
      const result2 = await engine.evaluatePolicy({ sourceCode: '#![no_std]', policy });

      const best = engine.getBestResult([result1, result2]);
      expect(best).not.toBeNull();
      expect(best!.score).toBe(100);
    });

    it('returns null for empty results', () => {
      expect(engine.getBestResult([])).toBeNull();
    });
  });

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const instance1 = PolicyEngine.getInstance();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('resetInstance creates a new instance', () => {
      const instance1 = PolicyEngine.getInstance();
      PolicyEngine.resetInstance();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });
});
