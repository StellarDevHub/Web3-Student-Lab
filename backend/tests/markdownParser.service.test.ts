import { describe, expect, it } from '@jest/globals';
import { MarkdownParserService } from '../src/services/markdownParser.service.js';

describe('MarkdownParserService', () => {
  it('should compile simple markdown to HTML', () => {
    const markdown = '# Hello World\nThis is **bold** text.';
    const result = MarkdownParserService.parse(markdown);

    expect(result.html).toContain('<h1>Hello World</h1>');
    expect(result.html).toContain('This is <strong>bold</strong> text.');
  });

  it('should sanitize HTML elements to prevent XSS payloads', () => {
    const xssMarkdown = 'Some text <script>alert("XSS")</script> and <img src="x" onerror="alert(\'XSS\')">';
    const result = MarkdownParserService.parse(xssMarkdown);

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('onerror');
    expect(result.html).toContain('<img src="x" />');
  });

  it('should extract and tokenize code blocks with correct language and code', () => {
    const markdownWithCode = `
# Code Example
Here is some Rust code:
\`\`\`rust
fn main() {
    println!("Hello, Soroban!");
}
\`\`\`
And here is some Javascript:
\`\`\`javascript
const x = 42;
\`\`\`
`;
    const result = MarkdownParserService.parse(markdownWithCode);

    expect(result.codeBlocks).toHaveLength(2);
    expect(result.codeBlocks[0]).toEqual({
      language: 'rust',
      code: 'fn main() {\n    println!("Hello, Soroban!");\n}',
    });
    expect(result.codeBlocks[1]).toEqual({
      language: 'javascript',
      code: 'const x = 42;',
    });
  });

  it('should handle empty or undefined content gracefully', () => {
    const result = MarkdownParserService.parse('');
    expect(result.html).toBe('');
    expect(result.codeBlocks).toEqual([]);
  });
});
