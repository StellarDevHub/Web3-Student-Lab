import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { swaggerSpec } from '../src/config/swagger.js';

type OpenApiSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  additionalProperties?: boolean | OpenApiSchema;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
};

type OpenApiParameter = {
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenApiSchema;
};

type OpenApiOperation = {
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>;
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
};

const document = swaggerSpec as OpenApiDocument;
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function schemaType(schema: OpenApiSchema | undefined): string {
  if (!schema) return 'unknown';
  if (schema.$ref?.startsWith('#/components/schemas/')) {
    const name = schema.$ref.slice('#/components/schemas/'.length);
    return `components["schemas"][${JSON.stringify(name)}]`;
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ') || 'never';

  const variants = schema.oneOf ?? schema.anyOf;
  if (variants) return variants.map(schemaType).join(' | ') || 'never';
  if (schema.allOf) return schema.allOf.map(schemaType).join(' & ') || 'unknown';

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const includesNull = schema.nullable || types.includes('null');
  const nonNullTypes = types.filter((type) => type !== 'null');
  const type = nonNullTypes[0];
  let result: string;

  if (schema.properties || type === 'object') {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(
      ([name, propertySchema]) =>
        `    ${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${schemaType(propertySchema)};`
    );
    if (properties.length > 0) {
      result = `{\n${properties.join('\n')}\n  }`;
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      result = `Record<string, ${schemaType(schema.additionalProperties)}>`;
    } else if (schema.additionalProperties === false) {
      result = 'Record<string, never>';
    } else {
      result = 'Record<string, unknown>';
    }
  } else if (type === 'array') {
    result = `Array<${schemaType(schema.items)}>`;
  } else if (type === 'string') {
    result = 'string';
  } else if (type === 'integer' || type === 'number') {
    result = 'number';
  } else if (type === 'boolean') {
    result = 'boolean';
  } else {
    result = 'unknown';
  }

  return includesNull ? `${result} | null` : result;
}

function contentSchemaType(
  content: Record<string, { schema?: OpenApiSchema }> | undefined
): string {
  const schemas = Object.values(content ?? {}).map((entry) => schemaType(entry.schema));
  return schemas.length > 0 ? [...new Set(schemas)].join(' | ') : 'unknown';
}

function generateComponents(): string {
  const schemas = Object.entries(document.components?.schemas ?? {}).map(
    ([name, schema]) => `    ${JSON.stringify(name)}: ${schemaType(schema)};`
  );
  return `export interface components {\n  schemas: {\n${schemas.join('\n')}\n  };\n}\n`;
}

function generatePaths(): string {
  const paths = Object.entries(document.paths ?? {}).map(([routePath, pathItem]) => {
    const operations = Object.entries(pathItem)
      .filter(([method, operation]) => httpMethods.has(method.toLowerCase()) && !!operation)
      .map(([method, rawOperation]) => {
        const operation = rawOperation as OpenApiOperation;
        const pathParameters = (operation.parameters ?? []).filter((parameter) => parameter.in === 'path');
        const queryParameters = (operation.parameters ?? []).filter(
          (parameter) => parameter.in === 'query'
        );
        const parameterProperty = (parameters: OpenApiParameter[]) =>
          parameters.length === 0
            ? 'never'
            : `{\n${parameters
                .map(
                  (parameter) =>
                    `          ${JSON.stringify(parameter.name)}${parameter.required ? '' : '?'}: ${schemaType(parameter.schema)};`
                )
                .join('\n')}\n        }`;
        const requestBody = operation.requestBody
          ? `\n      requestBody: ${contentSchemaType(operation.requestBody.content)};`
          : '';
        const responses = Object.entries(operation.responses ?? {}).map(
          ([status, response]) =>
            `        ${JSON.stringify(status)}: { content: ${contentSchemaType(response.content)} };`
        );
        const parameterGroups = [
          pathParameters.length > 0 ? `        path: ${parameterProperty(pathParameters)};` : '',
          queryParameters.length > 0 ? `        query: ${parameterProperty(queryParameters)};` : '',
        ].filter(Boolean);
        const parameters =
          parameterGroups.length > 0
            ? `\n      parameters: {\n${parameterGroups.join('\n')}\n      };`
            : '';

        return `    ${JSON.stringify(method.toLowerCase())}: {${parameters}${requestBody}\n      responses: {\n${responses.join('\n')}\n      };\n    };`;
      });
    return `  ${JSON.stringify(routePath)}: {\n${operations.join('\n')}\n  };`;
  });
  return `export interface paths {\n${paths.join('\n')}\n}\n`;
}

function generateClient(): string {
  return `${generateComponents()}
${generatePaths()}
type Methods<P extends keyof paths> = Extract<keyof paths[P], string>;
type Operation<P extends keyof paths, M extends Methods<P>> = paths[P][M];
type OperationParameters<O> = O extends { parameters: infer Parameters } ? Parameters : never;
type OperationBody<O> = O extends { requestBody: infer Body } ? Body : never;
type SuccessResponses<R> = {
  [Status in keyof R as Status extends \`2\${string}\` ? Status : never]: R[Status];
};
type JsonContent<R> = R extends { content: infer Content }
  ? Content extends { 'application/json': infer Json }
    ? Json
    : Content extends Record<string, unknown>
      ? Content[keyof Content]
      : unknown
  : unknown;
type OperationResponse<O> = O extends { responses: infer Responses }
  ? JsonContent<SuccessResponses<Responses>[keyof SuccessResponses<Responses>]>
  : unknown;

export type RequestOptions<
  P extends keyof paths,
  M extends Methods<P>,
> = {
  parameters?: OperationParameters<Operation<P, M>>;
  body?: OperationBody<Operation<P, M>>;
  headers?: HeadersInit;
};

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: HeadersInit = {},
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async request<P extends keyof paths, M extends Methods<P>>(
    route: P,
    method: M,
    options: RequestOptions<P, M> = {},
  ): Promise<OperationResponse<Operation<P, M>>> {
    const parameters = options.parameters as
      | { path?: Record<string, unknown>; query?: Record<string, unknown> }
      | undefined;
    const routePath = String(route).replace(/\\{([^}]+)\\}/g, (_match, name: string) => {
      const value = parameters?.path?.[name];
      if (value === undefined || value === null) {
        throw new Error(\`Missing path parameter "\${name}" for \${String(method)} \${String(route)}\`);
      }
      return encodeURIComponent(String(value));
    });
    const url = new URL(routePath, this.baseUrl);
    for (const [key, value] of Object.entries(parameters?.query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    const hasBody = options.body !== undefined;
    if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(url, {
      method: String(method).toUpperCase(),
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      throw new Error(\`API request failed with status \${response.status} for \${String(method).toUpperCase()} \${url.pathname}\`);
    }
    if (response.status === 204) return undefined as OperationResponse<Operation<P, M>>;
    return (await response.json()) as OperationResponse<Operation<P, M>>;
  }
}
`;
}

const outputDirectory = path.resolve(process.cwd(), 'generated');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, 'openapi-client.ts'), generateClient(), 'utf8');
console.log(`Generated typed OpenAPI client at ${path.join(outputDirectory, 'openapi-client.ts')}`);