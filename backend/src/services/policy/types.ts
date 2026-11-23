export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyRule {
  id: string;
  name?: string;
  description?: string;
  pattern: RegExp;
  severity: Severity;
  message: string;
  remediation: string;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  version: string;
  rules: PolicyRule[];
  enabled?: boolean;
}

export interface PolicyFinding {
  id: string;
  rule: string;
  severity: Severity;
  line: number;
  message: string;
  remediation: string;
}

export interface PolicyResult {
  findings: PolicyFinding[];
  score: number;
  scannedAt: string;
  summary: string;
  policy: {
    id: string;
    name: string;
    version: string;
  };
}

export interface PolicyEvaluationOptions {
  sourceCode: string;
  policy: Policy;
}

export interface PolicyValidationResult {
  valid: boolean;
  error?: string;
}

export const POLICY_VERSION = '1.0.0';
