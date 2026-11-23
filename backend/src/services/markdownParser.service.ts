import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export interface ParsedCodeBlock {
  language: string;
  code: string;
}

export interface ParsedContent {
  html: string;
  codeBlocks: ParsedCodeBlock[];
}

export class MarkdownParserService {
  /**
   * Parse Markdown or MDX content into sanitized HTML and tokenized code blocks.
   * Ensures safety against XSS attacks.
   */
  public static parse(content: string): ParsedContent {
    if (!content) {
      return { html: '', codeBlocks: [] };
    }

    // Compile Markdown to HTML
    const rawHtml = marked.parse(content) as string;

    // Sanitize HTML to prevent XSS (allowing standard formatting tags, stripping scripts/event handlers)
    const html = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'span', 'div'
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'title', 'width', 'height'],
      },
    });

    // Extract code blocks using marked lexer
    const tokens = marked.lexer(content);
    const codeBlocks: ParsedCodeBlock[] = [];

    const traverse = (tokenList: any[]) => {
      for (const token of tokenList) {
        if (token.type === 'code') {
          codeBlocks.push({
            language: token.lang || 'text',
            code: token.text,
          });
        } else if (token.tokens) {
          traverse(token.tokens);
        }
      }
    };

    traverse(tokens);

    return {
      html,
      codeBlocks,
    };
  }
}
