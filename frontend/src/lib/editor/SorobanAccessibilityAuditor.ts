/**
 * SorobanAccessibilityAuditor
 *
 * Audits Soroban smart contract source code for accessibility-related issues.
 * "Accessibility" here covers the contract's *interface accessibility* for
 * human developers and tools:
 *
 *  - Missing documentation on public contract functions
 *  - Undocumented / opaque error codes
 *  - Events lacking semantic topic labels
 *  - Public functions with no parameter names (hurts readability & tooling)
 *  - Storage keys that are raw bytes rather than readable Symbols
 *  - Contract structs without the required #[contract] attribute
 *  - Panic-only error handling (should use Result / Error types instead)
 *
 * Each issue carries a severity (error | warning | info), a human-readable
 * message, an optional suggestion, and the line number where it was detected.
 */

export type AuditSeverity = 'error' | 'warning' | 'info';

export interface AuditIssue {
  /** Unique rule identifier, e.g. "missing-doc-comment" */
  rule: string;
  severity: AuditSeverity;
  /** Human-readable description of the issue */
  message: string;
  /** Actionable fix hint shown to the user */
  suggestion: string;
  /** 1-indexed line number in the source */
  line: number;
  /** Optional column (1-indexed) for precise location */
  column?: number;
}

export interface AuditResult {
  issues: AuditIssue[];
  /** Total counts by severity for quick summary badges */
  counts: {
    error: number;
    warning: number;
    info: number;
  };
  /** Whether any issues were found */
  hasIssues: boolean;
  /** True only when all checks pass with zero issues */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true when a line (or lines just before it) contains a doc comment */
function hasDocComment(lines: string[], lineIndex: number): boolean {
  for (let i = lineIndex - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    // Block doc comment above — ///  or  /** … */
    if (trimmed.startsWith('///') || trimmed.startsWith('/**') || trimmed.startsWith('*')) {
      return true;
    }
    break;
  }
  return false;
}

/** Extract the name from a `pub fn name(` declaration */
function extractFnName(line: string): string | null {
  const match = line.match(/pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(<]/);
  return match ? match[1] : null;
}

/** Detect whether we are inside a #[contractimpl] block (very rough heuristic) */
function findContractImplRanges(lines: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = -1;
  let inContractImpl = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/#\[\s*contractimpl\s*\]/.test(trimmed)) {
      inContractImpl = true;
    }

    if (inContractImpl) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            ranges.push({ start, end: i });
            inContractImpl = false;
            start = -1;
          }
        }
      }
    }
  }

  return ranges;
}

/** Return true if the given lineIndex falls inside any contractimpl block */
function isInsideContractImpl(
  lineIndex: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  return ranges.some((r) => lineIndex >= r.start && lineIndex <= r.end);
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/**
 * RULE: missing-fn-doc
 * Every `pub fn` inside a #[contractimpl] block should have a doc comment.
 */
function checkMissingFnDoc(lines: string[], implRanges: Array<{ start: number; end: number }>): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/pub\s+fn\s+/.test(line)) continue;
    if (!isInsideContractImpl(i, implRanges)) continue;

    const fnName = extractFnName(line);
    if (!fnName) continue;

    // Constructor-style functions named "new" or "__constructor" are exempt
    if (fnName === 'new' || fnName === '__constructor') continue;

    if (!hasDocComment(lines, i)) {
      issues.push({
        rule: 'missing-fn-doc',
        severity: 'warning',
        message: `Public contract function \`${fnName}\` is missing a documentation comment.`,
        suggestion: `Add a /// doc comment above \`pub fn ${fnName}\` to describe its behaviour, parameters, and return value.`,
        line: i + 1,
        column: line.indexOf('pub') + 1,
      });
    }
  }

  return issues;
}

/**
 * RULE: opaque-error-code
 * Error enums decorated with #[contracterror] should have descriptive variant
 * names — not raw numbers or single-letter identifiers.
 */
function checkOpaqueErrorCodes(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let inContractError = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/#\[\s*contracterror\s*\]/.test(trimmed)) {
      inContractError = true;
    }

    if (inContractError) {
      for (const ch of lines[i]) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth--;
          if (braceDepth === 0) inContractError = false;
        }
      }

      // Variant lines look like:   SomeName = 1,
      const variantMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*,?$/);
      if (variantMatch) {
        const variantName = variantMatch[1];
        // Flag variants that are just one or two chars, or that look like E1 / Err1
        if (variantName.length <= 2 || /^E\d+$|^Err\d+$/i.test(variantName)) {
          issues.push({
            rule: 'opaque-error-code',
            severity: 'warning',
            message: `Error variant \`${variantName}\` is not descriptive. Opaque error codes make contracts hard to integrate.`,
            suggestion: `Rename \`${variantName}\` to something descriptive like \`InsufficientBalance\`, \`Unauthorized\`, or \`NotFound\`.`,
            line: i + 1,
            column: lines[i].indexOf(variantName) + 1,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * RULE: undocumented-error-enum
 * A #[contracterror] enum without a doc comment makes integrators guess the
 * meaning of each code.
 */
function checkUndocumentedErrorEnum(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!/#\[\s*contracterror\s*\]/.test(trimmed)) continue;

    // Find the enum line that follows
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      if (/pub\s+enum\s+/.test(lines[j])) {
        if (!hasDocComment(lines, i)) {
          const enumMatch = lines[j].match(/pub\s+enum\s+([A-Za-z_][A-Za-z0-9_]*)/);
          const enumName = enumMatch ? enumMatch[1] : 'error enum';
          issues.push({
            rule: 'undocumented-error-enum',
            severity: 'info',
            message: `Error enum \`${enumName}\` has no documentation comment.`,
            suggestion: `Add a /// comment above #[contracterror] explaining when each variant is returned.`,
            line: i + 1,
          });
        }
        break;
      }
    }
  }

  return issues;
}

/**
 * RULE: event-missing-topics
 * Calls to env.events().publish() should include at least two topics so that
 * off-chain indexers can filter by event type.
 *
 * We parse the topics tuple by counting balanced parentheses so that inner
 * calls like Symbol::new(&env, "name") don't fool the comma counter.
 */
function checkEventMissingTopics(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match   env.events().publish(   or   events().publish(
    if (!/(env\.)?events\s*\(\s*\)\s*\.publish\s*\(/.test(line)) continue;

    // Find the opening paren of .publish( and then the first ( after it,
    // which begins the topics tuple. We count balanced parens to find where
    // the tuple ends and count top-level commas.
    const publishCallIdx = line.search(/\.publish\s*\(/);
    if (publishCallIdx === -1) continue;

    // Advance past ".publish("
    let pos = publishCallIdx;
    while (pos < line.length && line[pos] !== '(') pos++;
    pos++; // skip the opening paren of publish(

    // Skip whitespace to find the start of the topics tuple "("
    while (pos < line.length && line[pos] === ' ') pos++;

    if (pos >= line.length || line[pos] !== '(') continue; // no tuple literal on this line

    // Walk the tuple, counting top-level commas (ignoring nested parens)
    let tupleDepth = 0;
    let topLevelCommas = 0;
    let nonEmpty = false;

    for (let k = pos; k < line.length; k++) {
      const ch = line[k];
      if (ch === '(') {
        tupleDepth++;
      } else if (ch === ')') {
        tupleDepth--;
        if (tupleDepth === 0) break; // end of tuple
      } else if (ch === ',' && tupleDepth === 1) {
        topLevelCommas++;
      } else if (tupleDepth >= 1 && ch !== ' ' && ch !== '\t') {
        nonEmpty = true;
      }
    }

    // topLevelCommas+1 gives us the number of elements (trailing comma = same count)
    // A single-topic tuple like (topic,) has 1 comma but only 1 element.
    // We treat topLevelCommas >= 1 as having 2+ topics only when nonEmpty.
    // For a trailing-comma tuple:  (a,)  → 1 comma but 1 element.
    // For a two-element tuple:     (a, b) → 1 comma, 2 elements.
    // Distinction: does the last comma have content after it before the closing paren?
    // Simplest heuristic: trim the inner content and count non-empty parts by splitting on comma.

    // Re-extract the raw topics content for a simple split
    let tupleClosed = false;
    let depth2 = 0;
    let tupleContent = '';
    let tupleStarted = false;
    for (let k = pos; k < line.length; k++) {
      const ch = line[k];
      if (ch === '(') {
        depth2++;
        if (depth2 === 1) { tupleStarted = true; continue; } // skip outer tuple's own (
      } else if (ch === ')') {
        depth2--;
        if (depth2 === 0) { tupleClosed = true; break; }
      }
      if (tupleStarted && depth2 >= 1) tupleContent += ch;
    }

    if (!tupleClosed) continue;

    // Count top-level items within tupleContent, tracking only () depth
    let itemDepth = 0;
    let itemCommas = 0;
    let hasContent = false;
    for (let k = 0; k < tupleContent.length; k++) {
      const ch = tupleContent[k];
      if (ch === '(') {
        itemDepth++;
      } else if (ch === ')') {
        if (itemDepth > 0) itemDepth--;
      } else if (ch === ',' && itemDepth === 0) {
        itemCommas++;
      } else if (ch !== ' ' && ch !== '\t' && itemDepth === 0) {
        hasContent = true;
      }
    }

    // Trailing comma means itemCommas items (e.g., "a," → 1 comma, 1 item)
    // No trailing comma means itemCommas+1 items (e.g., "a, b" → 1 comma, 2 items)
    const lastNonSpace = tupleContent.trimEnd().slice(-1);
    const itemCount = lastNonSpace === ',' ? itemCommas : (hasContent ? itemCommas + 1 : 0);

    if (itemCount < 2) {
      issues.push({
        rule: 'event-missing-topics',
        severity: 'info',
        message: `Event published with fewer than 2 topics. Indexers and clients rely on topics for event filtering.`,
        suggestion: `Provide at least two topics: an event-type Symbol and a relevant identifier, e.g. (Symbol::new(&env, "transfer"), from_address).`,
        line: i + 1,
        column: publishCallIdx + 1,
      });
    }
  }

  return issues;
}

/**
 * RULE: raw-bytes-storage-key
 * Using raw Bytes or BytesN as storage keys is hard to debug. Prefer Symbol.
 */
function checkRawBytesStorageKey(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // storage().instance|persistent|temporary().set(Bytes::...  or BytesN::...
    if (!/(instance|persistent|temporary)\s*\(\s*\)\s*\.\s*(get|set|has|remove)\s*\(/.test(line)) {
      continue;
    }

    if (/Bytes\s*::/.test(line) || /BytesN\s*::/.test(line)) {
      issues.push({
        rule: 'raw-bytes-storage-key',
        severity: 'info',
        message: `Using raw Bytes/BytesN as a storage key reduces readability and makes debugging harder.`,
        suggestion: `Use \`Symbol::new(&env, "key_name")\` or a #[contracttype] enum as your storage key instead.`,
        line: i + 1,
        column: (line.match(/Bytes/)?.index ?? 0) + 1,
      });
    }
  }

  return issues;
}

/**
 * RULE: panic-only-error-handling
 * Using panic!() or unwrap() in contract code is poor practice — panics cannot
 * be caught by callers. Return Result/Error types instead.
 */
function checkPanicOnlyErrorHandling(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    const panicMatch = line.match(/\bpanic!\s*\(/);
    if (panicMatch) {
      issues.push({
        rule: 'panic-only-error-handling',
        severity: 'error',
        message: `\`panic!()\` detected in contract code. Panics cannot be caught by callers and prevent graceful error handling.`,
        suggestion: `Return a \`Result<T, ContractError>\` or use \`env.panic_with_error()\` to propagate typed errors that clients can handle.`,
        line: i + 1,
        column: (panicMatch.index ?? 0) + 1,
      });
    }

    // .unwrap() in a context that looks like a contract function
    const unwrapMatch = line.match(/\.unwrap\s*\(\s*\)/);
    if (unwrapMatch) {
      issues.push({
        rule: 'panic-only-error-handling',
        severity: 'warning',
        message: `\`.unwrap()\` can panic on \`None\`/\`Err\` and will abort the contract invocation.`,
        suggestion: `Replace \`.unwrap()\` with \`.unwrap_or_default()\`, \`.unwrap_or(fallback)\`, or propagate the error with \`?\`.`,
        line: i + 1,
        column: (unwrapMatch.index ?? 0) + 1,
      });
    }
  }

  return issues;
}

/**
 * RULE: missing-contract-attribute
 * A public struct inside a file that uses soroban_sdk imports but is missing
 * #[contract] is likely a contract that will not compile.
 */
function checkMissingContractAttribute(lines: string[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const hasSorobanImport = lines.some((l) => /use\s+soroban_sdk::/.test(l));
  if (!hasSorobanImport) return issues;

  for (let i = 0; i < lines.length; i++) {
    if (!/pub\s+struct\s+[A-Z][A-Za-z0-9_]*\s*[;{]/.test(lines[i])) continue;

    // Look backward for #[contract]
    let found = false;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j].trim();
      if (prev === '' || prev.startsWith('//') || prev.startsWith('/*') || prev.startsWith('*')) {
        continue;
      }
      if (/#\[\s*contract\s*\]/.test(prev) || /#\[\s*contracttype\s*\]/.test(prev)) {
        found = true;
      }
      break;
    }

    if (!found) {
      const structMatch = lines[i].match(/pub\s+struct\s+([A-Z][A-Za-z0-9_]*)/);
      const structName = structMatch ? structMatch[1] : 'struct';
      issues.push({
        rule: 'missing-contract-attribute',
        severity: 'error',
        message: `Soroban contract struct \`${structName}\` is missing the \`#[contract]\` attribute.`,
        suggestion: `Add \`#[contract]\` on the line directly above \`pub struct ${structName}\`.`,
        line: i + 1,
        column: lines[i].indexOf('pub') + 1,
      });
    }
  }

  return issues;
}

/**
 * RULE: unnamed-fn-params
 * Public contract functions with unnamed parameters (using `_` as the sole
 * name) make the interface harder to understand for integrators.
 */
function checkUnnamedFnParams(
  lines: string[],
  implRanges: Array<{ start: number; end: number }>
): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isInsideContractImpl(i, implRanges)) continue;

    const line = lines[i];
    if (!/pub\s+fn\s+/.test(line)) continue;

    // Collect full signature — it may span multiple lines
    let sigLines = line;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      sigLines += ' ' + lines[j];
      if (sigLines.includes('{') || sigLines.includes(';')) break;
    }

    const fnName = extractFnName(line);
    if (!fnName) continue;

    // Extract param list between first ( and the matching )
    const paramStart = sigLines.indexOf('(');
    let depth = 0;
    let paramEnd = -1;
    for (let k = paramStart; k < sigLines.length; k++) {
      if (sigLines[k] === '(') depth++;
      else if (sigLines[k] === ')') {
        depth--;
        if (depth === 0) { paramEnd = k; break; }
      }
    }

    if (paramStart === -1 || paramEnd === -1) continue;

    const params = sigLines.slice(paramStart + 1, paramEnd);

    // Split by comma but be mindful of nested generics
    const paramParts: string[] = [];
    let current = '';
    let angleDepth = 0;
    for (const ch of params) {
      if (ch === '<') angleDepth++;
      else if (ch === '>') angleDepth--;
      else if (ch === ',' && angleDepth === 0) {
        paramParts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) paramParts.push(current.trim());

    for (const param of paramParts) {
      // Skip `self`, `&self`, `&mut self`, `env: Env`
      if (/^&?\s*(mut\s+)?self$/.test(param.trim())) continue;
      if (/^env\s*:\s*Env/.test(param.trim())) continue;

      // A param is underscore-only when the name part (before `:`) is `_`
      const colonIdx = param.indexOf(':');
      if (colonIdx === -1) continue;
      const name = param.slice(0, colonIdx).trim();

      if (name === '_') {
        issues.push({
          rule: 'unnamed-fn-params',
          severity: 'info',
          message: `Public function \`${fnName}\` has an unnamed parameter (\`_\`). Unnamed parameters hurt API readability for integrators.`,
          suggestion: `Replace \`_\` with a descriptive parameter name that reflects the argument's purpose.`,
          line: i + 1,
          column: line.indexOf('pub') + 1,
        });
        break; // one issue per function is enough
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full accessibility audit on a Soroban contract source string.
 * Returns a structured `AuditResult` with all found issues and summary counts.
 */
export function auditSorobanSource(source: string): AuditResult {
  if (!source || source.trim() === '') {
    return { issues: [], counts: { error: 0, warning: 0, info: 0 }, hasIssues: false, passed: true };
  }

  const lines = source.split('\n');
  const implRanges = findContractImplRanges(lines);

  const allIssues: AuditIssue[] = [
    ...checkMissingContractAttribute(lines),
    ...checkMissingFnDoc(lines, implRanges),
    ...checkOpaqueErrorCodes(lines),
    ...checkUndocumentedErrorEnum(lines),
    ...checkEventMissingTopics(lines),
    ...checkRawBytesStorageKey(lines),
    ...checkPanicOnlyErrorHandling(lines),
    ...checkUnnamedFnParams(lines, implRanges),
  ];

  // Sort by line number for predictable display order
  allIssues.sort((a, b) => a.line - b.line || a.severity.localeCompare(b.severity));

  const counts = {
    error: allIssues.filter((i) => i.severity === 'error').length,
    warning: allIssues.filter((i) => i.severity === 'warning').length,
    info: allIssues.filter((i) => i.severity === 'info').length,
  };

  return {
    issues: allIssues,
    counts,
    hasIssues: allIssues.length > 0,
    passed: allIssues.length === 0,
  };
}

/**
 * Convenience helper: returns only issues of the given severity.
 */
export function filterIssuesBySeverity(result: AuditResult, severity: AuditSeverity): AuditIssue[] {
  return result.issues.filter((i) => i.severity === severity);
}

/**
 * Returns a plain-text summary suitable for screen-readers or the terminal.
 */
export function formatAuditSummary(result: AuditResult): string {
  if (result.passed) {
    return 'Accessibility audit passed. No issues found.';
  }
  const parts: string[] = [];
  if (result.counts.error > 0) parts.push(`${result.counts.error} error${result.counts.error !== 1 ? 's' : ''}`);
  if (result.counts.warning > 0) parts.push(`${result.counts.warning} warning${result.counts.warning !== 1 ? 's' : ''}`);
  if (result.counts.info > 0) parts.push(`${result.counts.info} info${result.counts.info !== 1 ? 's' : ''}`);
  return `Accessibility audit: ${parts.join(', ')}.`;
}
