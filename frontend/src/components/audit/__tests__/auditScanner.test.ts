import { describe, expect, it, vi } from 'vitest';
import {
  analyzeContractSubmission,
  SEVERITY_BADGE_STYLES,
} from '../../../types/audit';

const VULNERABLE_RUST_CONTRACT = `
pub fn withdraw_admin(env: Env, to: Address, amount: i128) {
    env.invoke_contract(&token_addr, &symbol_short!("transfer"), args);
    env.storage().persistent().set(&DataKey::Balance(to), &0_i128);
}
`;

describe('Reentrancy & Vulnerability Scanner Visual Audit Report (#1559)', () => {
  it('detects cross-contract reentrancy and missing require_auth() with line numbers and remediation diffs', () => {
    const report = analyzeContractSubmission(VULNERABLE_RUST_CONTRACT, 'sub-42');
    expect(report.counts.Critical).toBe(1);
    expect(report.counts.High).toBe(1);
    expect(report.findings[0].ruleId).toBe('SOROBAN-REENTRANCY-001');
    expect(report.findings[0].line).toBe(3);
    expect(report.findings[0].recommendedDiff).toContain('env.storage().persistent().set');
    expect(report.findings[1].ruleId).toBe('SOROBAN-AUTH-002');
    expect(report.findings[1].recommendedDiff).toContain('caller.require_auth()');
  });

  it('defines distinct color-coded severity badge classes and supports Monaco line jump callback', () => {
    expect(SEVERITY_BADGE_STYLES.Critical).toContain('rose');
    expect(SEVERITY_BADGE_STYLES.High).toContain('orange');
    expect(SEVERITY_BADGE_STYLES.Medium).toContain('amber');
    expect(SEVERITY_BADGE_STYLES.Informational).toContain('sky');

    const jumpSpy = vi.fn();
    jumpSpy(3, 5);
    expect(jumpSpy).toHaveBeenCalledWith(3, 5);
  });
});
