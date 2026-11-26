import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { swaggerSpec } from '../src/config/swagger.js';

type OpenApiOperation = {
  responses?: Record<string, unknown>;
};

type OpenApiDocument = {
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: Record<string, Record<string, unknown>>;
};

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const methodNames = [...httpMethods].join('|');
const spec = swaggerSpec as OpenApiDocument;
const backendDirectory = process.cwd();
const repositoryDirectory = path.resolve(backendDirectory, '..');

function getChangedLines(): Map<string, Set<number>> {
  const head = process.env.OPENAPI_HEAD_SHA ?? 'HEAD';
  const requestedBase = process.env.OPENAPI_BASE_SHA;
  const base = requestedBase && !/^0+$/.test(requestedBase) ? requestedBase : 'HEAD^';
  const diff = execFileSync(
    'git',
    ['diff', '--no-ext-diff', '--no-color', '--unified=0', base, head, '--', 'backend/src'],
    { cwd: repositoryDirectory, encoding: 'utf8' }
  );
  const changedLines = new Map<string, Set<number>>();
  let currentFile: string | undefined;
  let nextLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = path.resolve(repositoryDirectory, line.slice('+++ b/'.length));
      if (!changedLines.has(currentFile)) changedLines.set(currentFile, new Set());
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) nextLine = Number(match[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++') && currentFile) {
      changedLines.get(currentFile)?.add(nextLine);
      nextLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\') && currentFile) {
      nextLine += 1;
    }
  }

  return changedLines;
}

function getSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'tests' ? [] : getSourceFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [entryPath]
      : [];
  });
}

function getStaticRoutePath(call: ts.CallExpression): string | undefined {
  const routeCall =
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isCallExpression(call.expression.expression) &&
    ts.isPropertyAccessExpression(call.expression.expression.expression) &&
    call.expression.expression.expression.name.text === 'route'
      ? call.expression.expression
      : call;
  const firstArgument = routeCall.arguments[0];
  if (!firstArgument) return undefined;
  if (ts.isStringLiteral(firstArgument) || ts.isNoSubstitutionTemplateLiteral(firstArgument)) {
    return firstArgument.text;
  }
  return undefined;
}

function isExpressRouteCall(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  const method = call.expression.name.text.toLowerCase();
  if (!httpMethods.has(method)) return false;

  const receiver = call.expression.expression;
  if (ts.isIdentifier(receiver)) {
    return /router|app/i.test(receiver.text) && !/request|response/i.test(receiver.text);
  }
  return (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === 'route'
  );
}

function getOpenApiComment(node: ts.Node, sourceText: string): string | undefined {
  const comments = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
  for (const comment of comments.reverse()) {
    const text = sourceText.slice(comment.pos, comment.end);
    if (text.includes('@openapi')) return text;
  }
  return undefined;
}

function parseOpenApiOperation(comment: string): { path: string; method: string } | undefined {
  const annotation = comment.match(/@openapi([\s\S]*?)(?:\*\/|$)/)?.[1];
  if (!annotation) return undefined;
  const documentedPath = annotation.match(/^\s*\*?\s*(\/[^:\s]+):\s*$/m)?.[1];
  const method = annotation.match(new RegExp(`^\\s*\\*\\s*(${methodNames}):\\s*$`, 'im'))?.[1];
  if (!documentedPath || !method) return undefined;
  return { path: documentedPath, method: method.toLowerCase() };
}

function routePathMatches(routePath: string, documentedPath: string): boolean {
  if (routePath === '/' || routePath === '/*') return true;
  const normalize = (value: string) =>
    value
      .split('/')
      .filter(Boolean)
      .map((segment) => segment.replace(/^:([^?]+)\??$/, '{$1}'));
  const routeSegments = normalize(routePath);
  const documentedSegments = normalize(documentedPath);
  return (
    routeSegments.length <= documentedSegments.length &&
    routeSegments.every(
      (segment, index) => segment === documentedSegments[documentedSegments.length - routeSegments.length + index]
    )
  );
}

function validateOpenApiSpec(errors: string[]): void {
  if (spec.openapi !== '3.1.0') {
    errors.push(`Expected OpenAPI 3.1.0, found ${spec.openapi ?? 'no version'}.`);
  }

  const components = spec.components ?? {};
  const visit = (value: unknown, location: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/')) {
        const [, section, name] = child.split('/');
        if (!section || !name || !components[section]?.[name]) {
          errors.push(`Unresolved OpenAPI reference "${child}" at ${location}.`);
        }
      } else {
        visit(child, `${location}.${key}`);
      }
    }
  };

  visit(spec.paths ?? {}, 'paths');
  for (const [documentedPath, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase()) || !operation || typeof operation !== 'object') continue;
      const responses = (operation as OpenApiOperation).responses;
      if (!responses || Object.keys(responses).length === 0) {
        errors.push(`${method.toUpperCase()} ${documentedPath} has no documented responses.`);
      }
    }
  }
}

function main(): void {
  const errors: string[] = [];
  const changedLines = getChangedLines();
  validateOpenApiSpec(errors);

  for (const sourcePath of getSourceFiles(path.join(backendDirectory, 'src'))) {
    const modifiedLines = changedLines.get(sourcePath);
    if (!modifiedLines?.size) continue;

    const sourceText = readFileSync(sourcePath, 'utf8');
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true);

    const inspect = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isExpressRouteCall(node)) {
        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const routeChanged = [...modifiedLines].some((line) => line >= startLine && line <= endLine);
        if (routeChanged) {
          const routePath = getStaticRoutePath(
            ts.isCallExpression(node.expression) ? node.expression : node
          );
          const method = ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text.toLowerCase()
            : 'unknown';
          const location = `${path.relative(repositoryDirectory, sourcePath)}:${startLine}`;

          if (!routePath) {
            errors.push(`${location}: route path must be a static string to verify OpenAPI drift.`);
          } else {
            const annotation = getOpenApiComment(node, sourceText);
            const documentedOperation = annotation ? parseOpenApiOperation(annotation) : undefined;
            if (!documentedOperation) {
              errors.push(
                `${location}: ${method.toUpperCase()} ${routePath} changed without an adjacent @openapi operation.`
              );
            } else if (
              documentedOperation.method !== method ||
              !routePathMatches(routePath, documentedOperation.path) ||
              !spec.paths?.[documentedOperation.path]?.[documentedOperation.method]
            ) {
              errors.push(
                `${location}: route ${method.toUpperCase()} ${routePath} does not match documented ` +
                  `${documentedOperation.method.toUpperCase()} ${documentedOperation.path}.`
              );
            }
          }
        }
      }
      ts.forEachChild(node, inspect);
    };

    inspect(sourceFile);
  }

  if (errors.length > 0) {
    console.error('OpenAPI drift detected:');
    for (const error of errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('OpenAPI drift check passed.');
}

main();