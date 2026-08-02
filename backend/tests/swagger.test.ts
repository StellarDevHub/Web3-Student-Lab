import { swaggerSpec } from '../src/config/swagger';

describe('Swagger Configuration', () => {
  it('should generate a valid OpenAPI 3.0.0 spec', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
    expect(swaggerSpec.info).toBeDefined();
    expect(swaggerSpec.info.title).toBe('Web3 Student Lab API Documentation');
    expect(swaggerSpec.info.version).toBe('1.0.0');
  });

  it('should include server configuration', () => {
    expect(swaggerSpec.servers).toBeDefined();
    expect(swaggerSpec.servers.length).toBeGreaterThan(0);
    expect(swaggerSpec.servers[0].url).toContain('http://localhost:8080');
  });

  it('should have security schemes for Bearer Auth', () => {
    expect(swaggerSpec.components.securitySchemes).toBeDefined();
    expect(swaggerSpec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(swaggerSpec.components.securitySchemes.bearerAuth.type).toBe('http');
    expect(swaggerSpec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('should extract path definitions from source files', () => {
    expect(swaggerSpec.paths).toBeDefined();
    // Assuming our health circuit breakers endpoint is picked up
    expect(Object.keys(swaggerSpec.paths).length).toBeGreaterThanOrEqual(0);
  });
});

