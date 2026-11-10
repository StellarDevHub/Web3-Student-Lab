export type AuditSeverity = 'Critical' | 'High' | 'Medium' | 'Informational';

export interface VulnerableCallHop {
  step: number;
  functionName: string;
  line: number;
  description: string;
}

export interface VulnerabilityFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: AuditSeverity;
  line: number;
  column: number;
  description: string;
  callPath: VulnerableCallHop[];
  vulnerableSnippet: string;
  recommendedDiff: string;
}

export interface AuditReportSummary {
  submissionId: string;
  analyzedAtIso: string;
  counts: Record<AuditSeverity, number>;
  findings: VulnerabilityFinding[];
}

export const SEVERITY_BADGE_STYLES: Record<AuditSeverity, string> = {
  Critical: 'bg-rose-600/20 text-rose-300 border-rose-500/50',
  High: 'bg-orange-600/20 text-orange-300 border-orange-500/50',
  Medium: 'bg-amber-600/20 text-amber-300 border-amber-500/50',
  Informational: 'bg-sky-600/20 text-sky-300 border-sky-500/50',
};

export function analyzeContractSubmission(
  sourceCode: string,
  submissionId: string = 'sub-default'
): AuditReportSummary {
  const lines = sourceCode.split(/\r?\n/);
  const findings: VulnerabilityFinding[] = [];

  lines.forEach((lineText, idx) => {
    const lineNumber = idx + 1;
    if (
      lineText.includes('invoke_contract') &&
      sourceCode.indexOf('storage().persistent().set') > sourceCode.indexOf('invoke_contract')
    ) {
      findings.push({
        id: `finding-reentrancy-${lineNumber}`,
        ruleId: 'SOROBAN-REENTRANCY-001',
        title: 'Cross-Contract Reentrancy Before State Update',
        severity: 'Critical',
        line: lineNumber,
        column: Math.max(1, lineText.indexOf('invoke_contract') + 1),
        description:
          'External cross-contract invocation occurs before persistent storage state mutation (Checks-Effects-Interactions violation).',
        callPath: [
          { step: 1, functionName: 'withdraw', line: lineNumber, description: 'Calls external invoke_contract' },
          { step: 2, functionName: 'storage.set', line: lineNumber + 1, description: 'Updates balance after external call' },
        ],
        vulnerableSnippet: lineText.trim(),
        recommendedDiff: `- ${lineText.trim()}\n+ env.storage().persistent().set(&key, &updated_balance);\n+ ${lineText.trim()}`,
      });
    }

    if (
      lineText.includes('pub fn ') &&
      (lineText.includes('admin') || lineText.includes('mint') || lineText.includes('upgrade')) &&
      !sourceCode.includes('require_auth')
    ) {
      findings.push({
        id: `finding-auth-${lineNumber}`,
        ruleId: 'SOROBAN-AUTH-002',
        title: 'Missing require_auth() Guard on Privileged Entrypoint',
        severity: 'High',
        line: lineNumber,
        column: 1,
        description:
          'Privileged contract entrypoint does not invoke Address::require_auth(), allowing unauthorized invocation.',
        callPath: [
          { step: 1, functionName: 'privileged_fn', line: lineNumber, description: 'Executes state mutation without require_auth()' },
        ],
        vulnerableSnippet: lineText.trim(),
        recommendedDiff: `+ caller.require_auth();\n  ${lineText.trim()}`,
      });
    }
  });

  const counts: Record<AuditSeverity, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Informational: 0,
  };
  for (const f of findings) {
    counts[f.severity] += 1;
  }

  const severityOrder: Record<AuditSeverity, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Informational: 3,
  };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    submissionId,
    analyzedAtIso: new Date().toISOString(),
    counts,
    findings,
  };
}
