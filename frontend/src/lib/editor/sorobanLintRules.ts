/**
 * Soroban static-analysis rules (pure, framework-free, fully tested).
 *
 * Detects three common Soroban anti-patterns and emits diagnostics with
 * optional 1-click quick fixes:
 *
 *   1. missing-require-auth  — sensitive functions that mutate storage but
 *      never authenticate the caller.
 *   2. integer-overflow      — unchecked `+` / `-` / `*` arithmetic.
 *   3. unbumped-storage      — persistent/instance storage writes without a
 *      matching `extend_ttl`, vulnerable to state eviction.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface FixRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface DiagnosticFix {
  title: string;
  range: FixRange;
  newText: string;
}

export interface Diagnostic {
  /** 1-based line number. */
  line: number;
  /** 1-based start column. */
  column: number;
  /** 1-based end column. */
  endColumn: number;
  message: string;
  severity: DiagnosticSeverity;
  code: string;
  fix?: DiagnosticFix;
}

export interface LintContext {
  looksLikeContract: boolean;
}

interface FnInfo {
  name: string;
  sigLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
  params: string;
  hasEnv: boolean;
  hasRequireAuth: boolean;
  writesStorage: boolean;
  hasExtendTtl: boolean;
}

const SIGNER_RE = /(sender|admin|caller|user|owner|account|signer|auth)/i;

function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findFunctions(lines: string[]): FnInfo[] {
  const fns: FnInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:pub\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!m) continue;
    const name = m[1];
    const parenIdx = lines[i].indexOf('(', m.index ?? 0);
    const closeParen = findMatchingParen(lines[i], parenIdx);
    const params =
      closeParen > parenIdx ? lines[i].slice(parenIdx + 1, closeParen) : '';

    // Find the opening brace of the body and its matching close brace.
    let depth = 0;
    let bodyStart = -1;
    let bodyEnd = -1;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      const lineText = lines[j];
      for (let k = 0; k < lineText.length; k++) {
        const ch = lineText[k];
        if (ch === '{') {
          if (!started) {
            bodyStart = j;
            started = true;
          }
          depth++;
        } else if (ch === '}') {
          if (started) {
            depth--;
            if (depth === 0) {
              bodyEnd = j;
              break;
            }
          }
        }
      }
      if (bodyEnd >= 0) break;
    }

    const bodyLines = bodyEnd >= bodyStart ? lines.slice(bodyStart, bodyEnd + 1) : [];
    const bodyText = bodyLines.join('\n');
    fns.push({
      name,
      sigLine: i,
      bodyStartLine: bodyStart,
      bodyEndLine: bodyEnd,
      params,
      hasEnv: /(^|[,\s:])Env\b/.test(params) || /\benv\s*:/.test(params),
      hasRequireAuth: /require_auth/.test(bodyText),
      writesStorage:
        /storage\(\)\s*\.\s*(persistent|instance)\s*\(\s*\)\s*\.\s*set\s*\(/.test(bodyText) ||
        /\.\s*set\s*\(/.test(bodyText) && /storage\(\)/.test(bodyText),
      hasExtendTtl: /extend_ttl|bump/.test(bodyText),
    });
  }
  return fns;
}

function signerParamName(params: string): string | null {
  const parts = params.split(',').map((p) => p.trim());
  for (const p of parts) {
    const name = p.split(':')[0]?.trim() ?? '';
    if (name && name !== '_env' && name !== 'env' && SIGNER_RE.test(name)) {
      return name;
    }
  }
  return null;
}

export function lintSorobanContract(source: string, ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!ctx.looksLikeContract) return diagnostics;

  const lines = source.split('\n');
  const fns = findFunctions(lines);

  for (const fn of fns) {
    const bodyLines = lines.slice(fn.bodyStartLine, fn.bodyEndLine + 1);

    // Rule 1: missing require_auth on state-mutating functions.
    if (fn.hasEnv && fn.writesStorage && !fn.hasRequireAuth) {
      const signer = signerParamName(fn.params);
      const fixLine = fn.bodyStartLine + 1; // 1-based
      const newText = signer
        ? `    ${signer}.require_auth();\n`
        : `    // TODO: authenticate the caller, e.g. caller.require_auth();\n`;
      diagnostics.push({
        line: fn.sigLine + 1,
        column: 1,
        endColumn: (lines[fn.sigLine]?.length ?? 1) + 1,
        message: `Function "${fn.name}" mutates storage without require_auth(). Add an auth check to prevent unauthorized writes.`,
        severity: 'warning',
        code: 'missing-require-auth',
        fix: {
          title: signer
            ? `Add ${signer}.require_auth()`
            : 'Add require_auth TODO',
          range: { startLine: fixLine, startColumn: 1, endLine: fixLine, endColumn: 1 },
          newText,
        },
      });
    }

    // Rule 2: unchecked integer arithmetic.
    let overflowFixAdded = false;
    for (let b = 0; b < bodyLines.length; b++) {
      const raw = bodyLines[b];
      const lineNo = fn.bodyStartLine + b + 1;
      // Skip comments and lines already using safe wrappers.
      if (/^\s*\/\//.test(raw)) continue;
      if (/checked_|saturating_|wrapping_|overflowing_/.test(raw)) continue;
      const risky = raw.match(/[A-Za-z0-9_)\]]\s*(\+|-|\*)=?\s*[A-Za-z0-9_(]/);
      if (!risky) continue;
      diagnostics.push({
        line: lineNo,
        column: 1,
        endColumn: raw.length + 1,
        message:
          'Unchecked integer arithmetic may overflow. Use checked_add / saturating_sub / wrapping_mul (or the BigInt/checked family) for Soroban integer types.',
        severity: 'warning',
        code: 'integer-overflow',
        fix: overflowFixAdded
          ? undefined
          : {
              title: 'Document safe-arithmetic best practice',
              range: {
                startLine: fn.bodyStartLine + 1,
                startColumn: 1,
                endLine: fn.bodyStartLine + 1,
                endColumn: 1,
              },
              newText: '    // Best practice: use checked_*/saturating_* to avoid overflow panics\n',
            },
      });
      overflowFixAdded = true;
    }

    // Rule 3: storage writes without extend_ttl (state eviction risk).
    if (fn.writesStorage && !fn.hasExtendTtl) {
      const storageLineIdx = bodyLines.findIndex((l) =>
        /storage\(\)\s*\.\s*(persistent|instance)\s*\(\s*\)\s*\.\s*set\s*\(/.test(l)
      );
      const lineNo =
        storageLineIdx >= 0 ? fn.bodyStartLine + storageLineIdx + 1 : fn.sigLine + 1;
      diagnostics.push({
        line: lineNo,
        column: 1,
        endColumn: (lines[lineNo - 1]?.length ?? 1) + 1,
        message:
          'Persistent/instance storage write without extend_ttl(). Un-bumped entries are susceptible to state eviction — call extend_ttl with min/max lifetimes.',
        severity: 'warning',
        code: 'unbumped-storage',
        fix: {
          title: 'Add extend_ttl reminder',
          range: {
            startLine: fn.bodyStartLine + 1,
            startColumn: 1,
            endLine: fn.bodyStartLine + 1,
            endColumn: 1,
          },
          newText:
            '    // Best practice: env.storage().instance().extend_ttl(MIN, MAX); to avoid eviction\n',
        },
      });
    }
  }

  return diagnostics;
}
