import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * Strict GitHub-flavored schema. Starts from rehype-sanitize's default
 * (which already strips script, iframe, event handlers and javascript: URLs)
 * and explicitly restricts tag and attribute allowlists.
 */
export const lessonSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr", "blockquote",
    "ul", "ol", "li", "input",
    "em", "strong", "del", "code", "pre", "kbd",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "sup", "sub", "span", "div",
  ],
  attributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    input: [["type", "checkbox"], "checked", "disabled"],
    th: ["align"],
    td: ["align"],
    code: [["className", /^language-[a-z0-9+#-]+$/i]],
    pre: [["className", /^language-[a-z0-9+#-]+$/i]],
    span: [],
    div: [],
  },
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  strip: ["script", "style", "iframe", "object", "embed", "form", "svg", "math"],
  clobberPrefix: "user-content-",
  clobber: ["name", "id"],
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, lessonSanitizeSchema)
  .use(rehypeStringify);

/**
 * Converts untrusted lesson Markdown into sanitized HTML.
 * Operates on the parsed AST, so disallowed nodes are removed structurally
 * rather than via regex filtering.
 */
export async function sanitizeLessonMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
