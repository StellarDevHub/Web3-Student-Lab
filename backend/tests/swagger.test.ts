import { swaggerSpec } from '../src/config/swagger';

// ---------------------------------------------------------------------------
// Helper: extract endpoint details from the spec
// ---------------------------------------------------------------------------
interface EndpointInfo {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  security: object[] | undefined;
  requestBody: object | undefined;
  responses: Record<string, object>;
  parameters: object[] | undefined;
}

function getEndpoints(): Record<string, EndpointInfo> {
  const endpoints: Record<string, EndpointInfo> = {};
  for (const [path, methods] of Object.entries(swaggerSpec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      endpoints[`${method.toUpperCase()} ${path}`] = {
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? '',
        tags: operation.tags ?? [],
        security: operation.security,
        requestBody: operation.requestBody,
        responses: operation.responses ?? {},
        parameters: operation.parameters,
      };
    }
  }
  return endpoints;
}

// ---------------------------------------------------------------------------
// Required paths and their expected properties
// ---------------------------------------------------------------------------
interface RequiredEndpointSpec {
  method: string;
  path: string;
  summary: string;
  tag: string;
  requiresAuth: boolean;
  successCode: number;
}

const REQUIRED_ENDPOINTS: RequiredEndpointSpec[] = [
  // System
  { method: 'GET', path: '/health', summary: 'Health check endpoint', tag: 'System', requiresAuth: false, successCode: 200 },
  // Health
  { method: 'GET', path: '/api/v1/health/circuit-breakers', summary: 'Get status of all circuit breakers', tag: 'Health', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/health/db', summary: 'Database health check', tag: 'Health', requiresAuth: false, successCode: 200 },
  // Auth
  { method: 'POST', path: '/api/v1/auth/register', summary: 'Register a new student', tag: 'Auth', requiresAuth: false, successCode: 201 },
  { method: 'POST', path: '/api/v1/auth/login', summary: 'Login with email and password', tag: 'Auth', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/auth/me', summary: 'Get current authenticated user', tag: 'Auth', requiresAuth: true, successCode: 200 },
  { method: 'POST', path: '/api/v1/auth/refresh', summary: 'Rotate refresh token', tag: 'Auth', requiresAuth: false, successCode: 200 },
  { method: 'POST', path: '/api/v1/auth/logout', summary: 'Logout and blacklist current access token', tag: 'Auth', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/auth/nonce', summary: 'Generate a nonce for Web3 wallet authentication', tag: 'Auth', requiresAuth: false, successCode: 200 },
  { method: 'POST', path: '/api/v1/auth/verify', summary: 'Verify Web3 wallet signature and authenticate', tag: 'Auth', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/auth/profile-status', summary: 'Check profile status by wallet address', tag: 'Auth', requiresAuth: false, successCode: 200 },
  // Learning
  { method: 'GET', path: '/api/v1/learning/courses', summary: 'List all learning courses', tag: 'Learning', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/learning/courses/{courseId}', summary: 'Get a specific course curriculum', tag: 'Learning', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/learning/courses/{courseId}/lessons/{lessonId}/content', summary: 'Get decentralized lesson content', tag: 'Learning', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/learning/courses/{courseId}/progress', summary: 'Get student progress for a course', tag: 'Learning', requiresAuth: true, successCode: 200 },
  { method: 'PATCH', path: '/api/v1/learning/courses/{courseId}/progress', summary: 'Update student progress for a course', tag: 'Learning', requiresAuth: true, successCode: 200 },
  // Certificates
  { method: 'GET', path: '/api/v1/certificates/verify/{tokenId}', summary: 'Verify a certificate by token ID', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'POST', path: '/api/v1/certificates/verify/batch', summary: 'Batch verify certificates', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/{tokenId}/metadata', summary: 'Get NFT metadata for a certificate', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/analytics', summary: 'Get certificate analytics', tag: 'Certificates', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/{certificateId}', summary: 'Get certificate by ID', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/student/{studentId}', summary: 'Get certificates by student', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'POST', path: '/api/v1/certificates', summary: 'Mint a new certificate', tag: 'Certificates', requiresAuth: true, successCode: 201 },
  { method: 'PUT', path: '/api/v1/certificates/{certificateId}/revoke', summary: 'Revoke a certificate', tag: 'Certificates', requiresAuth: true, successCode: 200 },
  { method: 'POST', path: '/api/v1/certificates/{certificateId}/reissue', summary: 'Reissue a certificate', tag: 'Certificates', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates', summary: 'List and filter certificates', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/{id}/image', summary: 'Generate certificate image', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  { method: 'GET', path: '/api/v1/certificates/{id}/qr', summary: 'Generate certificate QR code', tag: 'Certificates', requiresAuth: false, successCode: 200 },
  // Metrics
  { method: 'GET', path: '/api/v1/metrics', summary: 'Get aggregated metrics summary', tag: 'Metrics', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/metrics/performance', summary: 'Get raw performance metrics', tag: 'Metrics', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/metrics/errors', summary: 'Get raw error metrics', tag: 'Metrics', requiresAuth: true, successCode: 200 },
  { method: 'GET', path: '/api/v1/metrics/business', summary: 'Get raw business event metrics', tag: 'Metrics', requiresAuth: true, successCode: 200 },
  { method: 'POST', path: '/api/v1/metrics/reset', summary: 'Reset all collected metrics', tag: 'Metrics', requiresAuth: true, successCode: 200 },
];

// ---------------------------------------------------------------------------
// Required component schemas
// ---------------------------------------------------------------------------
const REQUIRED_SCHEMAS = ['Error', 'User', 'Certificate', 'CurriculumCourse', 'Progress'];

// ---------------------------------------------------------------------------
// Required tags
// ---------------------------------------------------------------------------
const REQUIRED_TAGS = ['System', 'Health', 'Auth', 'Learning', 'Certificates', 'Metrics'];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Swagger / OpenAPI Specification', () => {
  // --- Metadata ---
  describe('Metadata', () => {
    it('should declare OpenAPI 3.0.0', () => {
      expect(swaggerSpec.openapi).toBe('3.0.0');
    });

    it('should have correct info metadata', () => {
      expect(swaggerSpec.info).toBeDefined();
      expect(swaggerSpec.info.title).toBe('Web3 Student Lab API Documentation');
      expect(swaggerSpec.info.version).toBe('1.0.0');
      expect(swaggerSpec.info.description).toBeDefined();
      expect(swaggerSpec.info.description.length).toBeGreaterThan(50);
    });

    it('should have a contact pointing to the project repository', () => {
      expect(swaggerSpec.info.contact).toBeDefined();
      expect(swaggerSpec.info.contact.url).toContain('github.com/Web3-Student-Lab/Web3-Student-Lab');
      expect(swaggerSpec.info.contact.email).toBeDefined();
    });

    it('should have license info', () => {
      expect(swaggerSpec.info.license).toBeDefined();
      expect(swaggerSpec.info.license.name).toBe('MIT');
    });

    it('should have external documentation link', () => {
      expect(swaggerSpec.externalDocs).toBeDefined();
      expect(swaggerSpec.externalDocs.url).toContain('github.com/Web3-Student-Lab/Web3-Student-Lab');
    });
  });

  // --- Servers ---
  describe('Servers', () => {
    it('should include dev and production servers', () => {
      expect(swaggerSpec.servers).toBeDefined();
      expect(swaggerSpec.servers.length).toBeGreaterThanOrEqual(2);
      expect(swaggerSpec.servers.some((s: any) => s.url.includes('localhost'))).toBe(true);
    });
  });

  // --- Tags ---
  describe('Tags', () => {
    it('should define all required tags', () => {
      const tagNames = (swaggerSpec.tags ?? []).map((t: any) => t.name);
      for (const tag of REQUIRED_TAGS) {
        expect(tagNames).toContain(tag);
      }
    });

    it('each tag should have a description', () => {
      for (const tag of swaggerSpec.tags ?? []) {
        expect(tag.description).toBeDefined();
        expect(tag.description.length).toBeGreaterThan(0);
      }
    });
  });

  // --- Security ---
  describe('Security Schemes', () => {
    it('should define bearerAuth as an http bearer scheme', () => {
      const schemes = swaggerSpec.components?.securitySchemes ?? {};
      expect(schemes.bearerAuth).toBeDefined();
      expect(schemes.bearerAuth.type).toBe('http');
      expect(schemes.bearerAuth.scheme).toBe('bearer');
      expect(schemes.bearerAuth.bearerFormat).toBe('JWT');
    });
  });

  // --- Component Schemas ---
  describe('Component Schemas', () => {
    it('should declare all required shared schemas', () => {
      const schemaNames = Object.keys(swaggerSpec.components?.schemas ?? {});
      for (const name of REQUIRED_SCHEMAS) {
        expect(schemaNames).toContain(name);
      }
    });

    it('Error schema should have required error property', () => {
      const errorSchema = swaggerSpec.components?.schemas?.Error;
      expect(errorSchema).toBeDefined();
      expect(errorSchema.required).toContain('error');
    });

    it('User schema should have id, email, name', () => {
      const userSchema = swaggerSpec.components?.schemas?.User;
      expect(userSchema).toBeDefined();
      expect(userSchema.required).toEqual(expect.arrayContaining(['id', 'email', 'name']));
    });

    it('Progress schema should include status enum', () => {
      const progressSchema = swaggerSpec.components?.schemas?.Progress;
      expect(progressSchema).toBeDefined();
      expect(progressSchema.properties.status.enum).toEqual(['not_started', 'in_progress', 'completed']);
    });

    it('Certificate schema should include status field', () => {
      const certSchema = swaggerSpec.components?.schemas?.Certificate;
      expect(certSchema).toBeDefined();
      expect(certSchema.properties.status).toBeDefined();
    });
  });

  // --- Required Endpoints ---
  describe('Required Endpoints', () => {
    const endpoints = getEndpoints();

    for (const expected of REQUIRED_ENDPOINTS) {
      const key = `${expected.method} ${expected.path}`;

      it(`should have ${expected.method} ${expected.path}`, () => {
        expect(endpoints[key]).toBeDefined();
      });

      it(`${expected.method} ${expected.path} should have summary: "${expected.summary}"`, () => {
        const ep = endpoints[key];
        if (!ep) return; // already failed above
        expect(ep.summary).toBe(expected.summary);
      });

      it(`${expected.method} ${expected.path} should be tagged "${expected.tag}"`, () => {
        const ep = endpoints[key];
        if (!ep) return;
        expect(ep.tags).toContain(expected.tag);
      });

      it(`${expected.method} ${expected.path} should include ${expected.successCode} response`, () => {
        const ep = endpoints[key];
        if (!ep) return;
        expect(ep.responses).toHaveProperty(String(expected.successCode));
      });

      it(`${expected.method} ${expected.path} auth=${expected.requiresAuth}`, () => {
        const ep = endpoints[key];
        if (!ep) return;
        const hasAuth =
          Array.isArray(ep.security) &&
          ep.security.some((s: any) => 'bearerAuth' in s);
        if (expected.requiresAuth) {
          expect(hasAuth).toBe(true);
        } else {
          // For public endpoints, the spec should either omit security entirely,
          // or set security: [] to override global security.
          const explicitlyPublic =
            (!ep.security || ep.security.length === 0) ||
            (Array.isArray(ep.security) && ep.security.length === 0);
          expect(explicitlyPublic).toBe(true);
        }
      });
    }
  });

  // --- Paths sanity ---
  describe('Paths', () => {
    it('should have at least all required documented endpoints', () => {
      const endpointCount = Object.keys(getEndpoints()).length;
      expect(endpointCount).toBeGreaterThanOrEqual(REQUIRED_ENDPOINTS.length);
    });

    it('should not have unresolved $ref references', () => {
      const specStr = JSON.stringify(swaggerSpec);
      // Simple heuristic: ensure every $ref points to a defined component
      const refs = specStr.match(/#\/components\/schemas\/[A-Za-z]+/g) ?? [];
      const definedSchemas = Object.keys(swaggerSpec.components?.schemas ?? {});
      for (const ref of refs) {
        const schemaName = ref.replace('#/components/schemas/', '');
        expect(definedSchemas).toContain(schemaName);
      }
    });
  });
});
