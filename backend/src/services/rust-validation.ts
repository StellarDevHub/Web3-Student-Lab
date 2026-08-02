interface ValidationDiagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  code: string;
}

interface ValidationResult {
  isValid: boolean;
  diagnostics: ValidationDiagnostic[];
}

// Automated Code Validation Pipeline for Rust Playground
export class RustValidationService {
  static async validateCode(code: string): Promise<ValidationResult> {
    const diagnostics: ValidationDiagnostic[] = [];
    const stack: Array<{ char: string; line: number; column: number }> = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

    const lines = code.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
        const char = line[columnIndex]!;
        if (Object.prototype.hasOwnProperty.call(pairs, char)) {
          stack.push({ char, line: lineNumber, column: columnIndex + 1 });
          continue;
        }

        if (char === ')' || char === ']' || char === '}') {
          const opener = stack.pop();
          if (!opener) {
            diagnostics.push({
              line: lineNumber,
              column: columnIndex + 1,
              severity: 'error',
              message: `Unexpected closing token ${char}`,
              code: 'unexpected-token',
            });
            continue;
          }

          const expected = pairs[opener.char];
          if (expected !== char) {
            diagnostics.push({
              line: lineNumber,
              column: columnIndex + 1,
              severity: 'error',
              message: `Expected ${expected} to close ${opener.char} from line ${opener.line}`,
              code: 'mismatched-delimiter',
            });
          }
        }
      }
    });

    while (stack.length > 0) {
      const opener = stack.pop();
      if (!opener) continue;
      diagnostics.push({
        line: opener.line,
        column: opener.column,
        severity: 'error',
        message: `Unclosed block or parenthesis starting at ${opener.char}`,
        code: 'unclosed-block',
      });
    }

    if (/fn\s+\w+\s*\([^)]*$/.test(code) && diagnostics.length === 0) {
      diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Unclosed function signature',
        code: 'unclosed-function',
      });
    }

    return {
      isValid: diagnostics.length === 0,
      diagnostics,
    };
  }
}
