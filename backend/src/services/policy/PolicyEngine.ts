import logger from '../../utils/logger.js';
import {
  Policy,
  PolicyRule,
  PolicyFinding,
  PolicyResult,
  PolicyEvaluationOptions,
  PolicyValidationResult,
  Severity,
  POLICY_VERSION
} from './types.js';
import { sorobanSecurityPolicy } from './definitions.js';

export interface PolicyEngineOptions {
  enabledPolicies?: string[];
  strictMode?: boolean;
  maxSourceCodeLength?: number;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private readonly options: Required<PolicyEngineOptions>;
  private static instance: PolicyEngine | null = null;

  constructor(options: PolicyEngineOptions = {}) {
    this.options = {
      enabledPolicies: options.enabledPolicies || [],
      strictMode: options.strictMode ?? true,
      maxSourceCodeLength: options.maxSourceCodeLength || 50000,
    };

    this.loadPolicy(sorobanSecurityPolicy);
  }

  static getInstance(options?: PolicyEngineOptions): PolicyEngine {
    if (!PolicyEngine.instance) {
      PolicyEngine.instance = new PolicyEngine(options);
    }
    return PolicyEngine.instance;
  }

  static resetInstance(): void {
    PolicyEngine.instance = null;
  }

  loadPolicy(policy: Policy): void {
    const validation = this.validatePolicy(policy);
    if (!validation.valid) {
      throw new Error(`Invalid policy ${policy.id}: ${validation.error}`);
    }

    this.policies.set(policy.id, policy);
    logger.info(`Loaded policy: ${policy.id} v${policy.version} with ${policy.rules.length} rules`);
  }

  getPolicy(policyId: string): Policy | undefined {
    return this.policies.get(policyId);
  }

  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  getEnabledPolicies(): Policy[] {
    if (this.options.enabledPolicies.length === 0) {
      return this.getAllPolicies().filter(p => p.enabled !== false);
    }

    return this.options.enabledPolicies
      .map(id => this.policies.get(id))
      .filter((p): p is Policy => p !== undefined && p.enabled !== false);
  }

  getPolicyVersion(): string {
    return POLICY_VERSION;
  }

  async evaluatePolicy(options: PolicyEvaluationOptions): Promise<PolicyResult> {
    const { sourceCode, policy } = options;

    const validation = this.validateEvaluationRequest(sourceCode, policy);
    if (!validation.valid) {
      throw new Error(`Invalid evaluation request: ${validation.error}`);
    }

    const findings = this.executeRules(sourceCode, policy.rules);
    const score = this.calculateScore(findings);
    const summary = this.generateSummary(findings, policy);

    return {
      findings,
      score,
      scannedAt: new Date().toISOString(),
      summary,
      policy: {
        id: policy.id,
        name: policy.name,
        version: policy.version
      }
    };
  }

  async evaluateAllPolicies(sourceCode: string): Promise<PolicyResult[]> {
    const enabledPolicies = this.getEnabledPolicies();

    if (enabledPolicies.length === 0) {
      throw new Error('No enabled policies found');
    }

    const results: PolicyResult[] = [];

    for (const policy of enabledPolicies) {
      try {
        const result = await this.evaluatePolicy({ sourceCode, policy });
        results.push(result);
      } catch (error) {
        logger.error(`Failed to evaluate policy ${policy.id}:`, error);
        if (this.options.strictMode) {
          throw error;
        }
      }
    }

    return results;
  }

  getBestResult(results: PolicyResult[]): PolicyResult | null {
    if (results.length === 0) return null;

    return results.reduce((best, current) =>
      current.score > best.score ? current : best
    );
  }

  mergeResults(results: PolicyResult[], targetPolicyId?: string): PolicyResult {
    if (results.length === 0) {
      throw new Error('Cannot merge empty results');
    }

    if (results.length === 1) {
      return results[0]!;
    }

    const allFindings: PolicyFinding[] = [];
    const seenFindings = new Set<string>();

    for (const result of results) {
      for (const finding of result.findings) {
        const key = `${finding.rule}:${finding.line}`;
        if (!seenFindings.has(key)) {
          seenFindings.add(key);
          allFindings.push(finding);
        }
      }
    }

    const mergedScore = this.calculateScore(allFindings);
    const firstResult = results[0]!;
    const policy = targetPolicyId
      ? (this.getPolicy(targetPolicyId) || firstResult.policy)
      : firstResult.policy;

    return {
      findings: allFindings,
      score: mergedScore,
      scannedAt: new Date().toISOString(),
      summary: this.generateMergedSummary(allFindings, results),
      policy: {
        id: policy.id,
        name: policy.name,
        version: policy.version
      }
    };
  }

  validatePolicy(policy: Policy): PolicyValidationResult {
    if (!policy.id || typeof policy.id !== 'string') {
      return { valid: false, error: 'Policy must have a valid id' };
    }

    if (!policy.name || typeof policy.name !== 'string') {
      return { valid: false, error: 'Policy must have a valid name' };
    }

    if (!policy.version || typeof policy.version !== 'string') {
      return { valid: false, error: 'Policy must have a valid version' };
    }

    if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
      return { valid: false, error: 'Policy must have at least one rule' };
    }

    for (const rule of policy.rules) {
      const ruleValidation = this.validateRule(rule);
      if (!ruleValidation.valid) {
        return { valid: false, error: `Invalid rule ${rule.id}: ${ruleValidation.error}` };
      }
    }

    return { valid: true };
  }

  private validateRule(rule: PolicyRule): PolicyValidationResult {
    if (!rule.id || typeof rule.id !== 'string') {
      return { valid: false, error: 'Rule must have a valid id' };
    }

    if (!(rule.pattern instanceof RegExp)) {
      return { valid: false, error: 'Rule must have a valid RegExp pattern' };
    }

    if (!['low', 'medium', 'high', 'critical'].includes(rule.severity)) {
      return { valid: false, error: 'Rule must have a valid severity level' };
    }

    if (!rule.message || typeof rule.message !== 'string') {
      return { valid: false, error: 'Rule must have a valid message' };
    }

    if (!rule.remediation || typeof rule.remediation !== 'string') {
      return { valid: false, error: 'Rule must have a valid remediation' };
    }

    return { valid: true };
  }

  private validateEvaluationRequest(sourceCode: string, policy: Policy): PolicyValidationResult {
    if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
      return { valid: false, error: 'Source code is required and must be a non-empty string' };
    }

    if (sourceCode.length > this.options.maxSourceCodeLength) {
      return {
        valid: false,
        error: `Source code exceeds maximum length of ${this.options.maxSourceCodeLength} characters`
      };
    }

    return this.validatePolicy(policy);
  }

  private executeRules(sourceCode: string, rules: PolicyRule[]): PolicyFinding[] {
    const findings: PolicyFinding[] = [];
    const lines = sourceCode.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex] ?? '';

      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          findings.push({
            id: `${rule.id}-${lineIndex + 1}`,
            rule: rule.id,
            severity: rule.severity,
            line: lineIndex + 1,
            message: rule.message,
            remediation: rule.remediation
          });
        }
      }
    }

    for (const rule of rules) {
      if (rule.pattern.multiline || rule.pattern.source.includes('[\\s\\S]')) {
        const matches = sourceCode.match(rule.pattern);
        if (matches) {
          const beforeMatch = sourceCode.slice(0, matches.index || 0);
          const lineNumber = beforeMatch.split('\n').length;

          findings.push({
            id: `${rule.id}-${lineNumber}`,
            rule: rule.id,
            severity: rule.severity,
            line: lineNumber,
            message: rule.message,
            remediation: rule.remediation
          });
        }
      }
    }

    return this.deduplicateFindings(findings);
  }

  private deduplicateFindings(findings: PolicyFinding[]): PolicyFinding[] {
    const seen = new Set<string>();
    return findings.filter(finding => {
      const key = `${finding.rule}:${finding.line}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private calculateScore(findings: PolicyFinding[]): number {
    const severityWeights: Record<Severity, number> = {
      low: 5,
      medium: 15,
      high: 30,
      critical: 50
    };

    const totalPenalty = findings.reduce(
      (sum, finding) => sum + severityWeights[finding.severity],
      0
    );

    return Math.max(0, 100 - totalPenalty);
  }

  private generateSummary(findings: PolicyFinding[], policy: Policy): string {
    if (findings.length === 0) {
      return `No vulnerabilities detected by ${policy.name} policy.`;
    }

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (criticalCount > 0) {
      return `Critical security issues detected (${criticalCount}) — do not deploy until remediated.`;
    }

    if (highCount > 0) {
      return `High severity issues detected (${highCount}) — review before deployment.`;
    }

    return `${findings.length} security finding(s) detected. Review remediations before deployment.`;
  }

  private generateMergedSummary(findings: PolicyFinding[], results: PolicyResult[]): string {
    if (findings.length === 0) {
      return `No security issues detected across ${results.length} policies.`;
    }

    const policyNames = results.map(r => r.policy.name).join(', ');
    const criticalCount = findings.filter(f => f.severity === 'critical').length;

    if (criticalCount > 0) {
      return `Critical security issues detected (${criticalCount}) across multiple policies (${policyNames}).`;
    }

    return `${findings.length} security finding(s) detected across policies: ${policyNames}.`;
  }
}

export const policyEngine = PolicyEngine.getInstance();
