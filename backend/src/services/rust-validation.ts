export interface ValidationDiagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  code: string;
}

export type ValidationStatus = 'valid' | 'invalid' | 'rejected' | 'timed_out';

export interface ValidationResult {
  isValid: boolean;
  status: ValidationStatus;
  diagnostics: ValidationDiagnostic[];
}

export const RUST_VALIDATION_LIMITS = Object.freeze({
  maxInputBytes: 64 * 1024,
  timeoutMs: 100,
  maxDiagnostics: 100,
});

const DELIMITER_PAIRS: Readonly<Record<string, string>> = Object.freeze({
  '(': ')',
  '[': ']',
  '{': '}',
});
const CLOSING_DELIMITERS = new Set([')', ']', '}']);
const TIME_CHECK_INTERVAL = 256;

type ValidationClock = () => number;

function terminalResult(
  status: Extract<ValidationStatus, 'rejected' | 'timed_out'>,
  diagnostic: ValidationDiagnostic
): ValidationResult {
  return {
    isValid: false,
    status,
    diagnostics: [diagnostic],
  };
}

// Automated Code Validation Pipeline for Rust Playground
export class RustValidationService {
  /**
   * Performs lightweight validation without invoking a compiler.
   *
   * The optional clock is a deterministic testing seam. Production callers
   * should use the monotonic default.
   */
  static async validateCode(
    code: string,
    clock: ValidationClock = () => performance.now()
  ): Promise<ValidationResult> {
    if (
      code.length > RUST_VALIDATION_LIMITS.maxInputBytes ||
      Buffer.byteLength(code, 'utf8') > RUST_VALIDATION_LIMITS.maxInputBytes
    ) {
      return terminalResult('rejected', {
        line: 1,
        column: 1,
        severity: 'error',
        message: `Source code must not exceed ${RUST_VALIDATION_LIMITS.maxInputBytes} UTF-8 bytes`,
        code: 'input-too-large',
      });
    }

    const diagnostics: ValidationDiagnostic[] = [];
    const stack: Array<{ char: string; line: number; column: number }> = [];
    const startedAt = clock();
    let inspectedCharacters = 0;
    let diagnosticLimitReached = false;

    const addDiagnostic = (diagnostic: ValidationDiagnostic): boolean => {
      if (diagnostics.length < RUST_VALIDATION_LIMITS.maxDiagnostics - 1) {
        diagnostics.push(diagnostic);
        return true;
      }

      diagnostics.push({
        line: diagnostic.line,
        column: diagnostic.column,
        severity: 'error',
        message: `Validation stopped after ${RUST_VALIDATION_LIMITS.maxDiagnostics} diagnostics`,
        code: 'diagnostic-limit-exceeded',
      });
      diagnosticLimitReached = true;
      return false;
    };

    const hasTimedOut = (): boolean =>
      clock() - startedAt >= RUST_VALIDATION_LIMITS.timeoutMs;

    const timeoutResult = (line: number, column: number): ValidationResult =>
      terminalResult('timed_out', {
        line,
        column,
        severity: 'error',
        message: `Validation exceeded the ${RUST_VALIDATION_LIMITS.timeoutMs} ms time limit`,
        code: 'validation-timeout',
      });

    const lines = code.split(/\r?\n/);

    validationLoop: for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const lineNumber = index + 1;
      if (index % TIME_CHECK_INTERVAL === 0 && hasTimedOut()) {
        return timeoutResult(lineNumber, 1);
      }

      for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
        if (
          inspectedCharacters % TIME_CHECK_INTERVAL === 0 &&
          hasTimedOut()
        ) {
          return timeoutResult(lineNumber, columnIndex + 1);
        }
        inspectedCharacters += 1;

        const char = line[columnIndex] ?? '';
        if (Object.prototype.hasOwnProperty.call(DELIMITER_PAIRS, char)) {
          stack.push({ char, line: lineNumber, column: columnIndex + 1 });
          continue;
        }

        if (CLOSING_DELIMITERS.has(char)) {
          const opener = stack.pop();
          if (!opener) {
            if (
              !addDiagnostic({
                line: lineNumber,
                column: columnIndex + 1,
                severity: 'error',
                message: `Unexpected closing token ${char}`,
                code: 'unexpected-token',
              })
            ) {
              break validationLoop;
            }
            continue;
          }

          const expected = DELIMITER_PAIRS[opener.char];
          if (
            expected !== char &&
            !addDiagnostic({
              line: lineNumber,
              column: columnIndex + 1,
              severity: 'error',
              message: `Expected ${expected} to close ${opener.char} from line ${opener.line}`,
              code: 'mismatched-delimiter',
            })
          ) {
            break validationLoop;
          }
        }
      }
    }

    while (!diagnosticLimitReached && stack.length > 0) {
      if (hasTimedOut()) {
        const opener = stack[stack.length - 1];
        return timeoutResult(opener?.line ?? 1, opener?.column ?? 1);
      }

      const opener = stack.pop();
      if (!opener) continue;
      if (
        !addDiagnostic({
          line: opener.line,
          column: opener.column,
          severity: 'error',
          message: `Unclosed block or parenthesis starting at ${opener.char}`,
          code: 'unclosed-block',
        })
      ) {
        break;
      }
    }

    if (hasTimedOut()) {
      const lastLine = lines[lines.length - 1] ?? '';
      return timeoutResult(lines.length, lastLine.length + 1);
    }

    if (
      !diagnosticLimitReached &&
      /fn\s+\w+\s*\([^)]*$/.test(code) &&
      diagnostics.length === 0
    ) {
      addDiagnostic({
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Unclosed function signature',
        code: 'unclosed-function',
      });
    }

    if (hasTimedOut()) {
      const lastLine = lines[lines.length - 1] ?? '';
      return timeoutResult(lines.length, lastLine.length + 1);
    }

    return {
      isValid: diagnostics.length === 0,
      status: diagnostics.length === 0 ? 'valid' : 'invalid',
      diagnostics,
    };
  }
}
