import type { Policy, PolicyRule, Severity } from './types.js';

export const SOROBAN_SECURITY_POLICY_ID = 'soroban-security-baseline';
export const SOROBAN_SECURITY_POLICY_VERSION = '1.0.0';

const severityWeight = (severity: Severity): number => {
  return { low: 5, medium: 15, high: 30, critical: 50 }[severity];
};

export const SOROBAN_SECURITY_RULES: PolicyRule[] = [
  {
    id: 'std-import',
    name: 'No std:: imports',
    description: 'std:: imports are unavailable in no_std Soroban contracts.',
    pattern: /\buse\s+std::/,
    severity: 'critical',
    message: 'std:: imports are unavailable in no_std Soroban contracts.',
    remediation: 'Replace std:: types with soroban_sdk equivalents (Map, Vec).',
  },
  {
    id: 'missing-contract-attr',
    name: 'Missing contract attribute',
    description: 'Contract struct may be missing #[contract] attribute.',
    pattern: /pub\s+struct\s+[A-Z]\w*\s*\{/,
    severity: 'high',
    message: 'Contract struct may be missing #[contract] attribute.',
    remediation: 'Add #[contract] above the struct declaration.',
  },
  {
    id: 'unchecked-auth',
    name: 'Unchecked storage write',
    description: 'Storage write without visible authorization check.',
    pattern: /pub\s+fn\s+\w+[^{]*\{[^}]*storage\(\)[^}]*set/,
    severity: 'high',
    message: 'Storage write without visible authorization check.',
    remediation: 'Call require_auth() before mutating persistent storage.',
  },
  {
    id: 'panic-usage',
    name: 'panic! usage',
    description: 'panic! causes contract failure without graceful error handling.',
    pattern: /\bpanic!\(/,
    severity: 'medium',
    message: 'panic! causes contract failure without graceful error handling.',
    remediation: 'Return Result<T, Error> or use contract-specific error types.',
  },
  {
    id: 'unsafe-block',
    name: 'Unsafe block usage',
    description: 'Unsafe blocks are not supported in Soroban WASM targets.',
    pattern: /\bunsafe\s*\{/,
    severity: 'critical',
    message: 'Unsafe blocks are not supported in Soroban WASM targets.',
    remediation: 'Remove unsafe code and use SDK-safe abstractions.',
  },
  {
    id: 'integer-overflow-risk',
    name: 'Unchecked integer cast',
    description: 'Unchecked integer casts may overflow on large values.',
    pattern: /\bas\s+i128\b|\bas\s+u128\b/,
    severity: 'low',
    message: 'Unchecked integer casts may overflow on large values.',
    remediation: 'Use checked_add/checked_sub from soroban_sdk.',
  },
];

export const sorobanSecurityPolicy: Policy = {
  id: SOROBAN_SECURITY_POLICY_ID,
  name: 'Soroban Security Baseline',
  description: 'Baseline security policy for Soroban smart contracts targeting no_std WASM.',
  version: SOROBAN_SECURITY_POLICY_VERSION,
  enabled: true,
  rules: SOROBAN_SECURITY_RULES,
};

export const policyDefinitions: Record<string, Policy> = {
  [SOROBAN_SECURITY_POLICY_ID]: sorobanSecurityPolicy,
};

export { severityWeight };
