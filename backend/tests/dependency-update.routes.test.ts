import request from 'supertest';
import { app } from '../src/index.js';

const VALID_CARGO_TOML = `[package]
name = "test-contract"
version = "0.1.0"
edition = "2021"

[dependencies]
soroban-sdk = "21.7.6"
soroban-auth = "21.0.0"
`;

describe('Dependencies API - POST /dependencies/check', () => {
  it('returns dependency check results for valid Cargo.toml', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/check')
      .send({ cargoToml: VALID_CARGO_TOML })
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.dependencies)).toBe(true);
    expect(typeof res.body.outdatedCount).toBe('number');
    expect(res.body.checkedAt).toBeDefined();
    expect(res.body.cargoTomlHash).toBeDefined();
  });

  it('identifies soroban-sdk as outdated', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/check')
      .send({ cargoToml: VALID_CARGO_TOML })
      .expect(200);

    const sdk = res.body.dependencies.find((d: { name: string }) => d.name === 'soroban-sdk');
    expect(sdk).toBeDefined();
    expect(sdk.isOutdated).toBe(true);
    expect(sdk.latestVersion).toBe('22.0.7');
  });

  it('rejects missing cargoToml with 400', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/check')
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('rejects cargoToml exceeding max length with 400', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/check')
      .send({ cargoToml: 'x'.repeat(50_001) })
      .expect(400);

    expect(res.body).toHaveProperty('error', 'Validation failed');
  });
});

describe('Dependencies API - POST /dependencies/update', () => {
  it('applies update and returns suggestedCargoToml', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/update')
      .send({ cargoToml: VALID_CARGO_TOML, dependencies: ['soroban-sdk'] })
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(res.body.updated).toContain('soroban-sdk');
    expect(typeof res.body.suggestedCargoToml).toBe('string');
    expect(res.body.suggestedCargoToml).toContain('"22.0.7"');
  });

  it('reports failure for non-existent dependencies', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/update')
      .send({ cargoToml: VALID_CARGO_TOML, dependencies: ['nonexistent-crate'] })
      .expect(200);

    expect(res.body.failed).toContain('nonexistent-crate');
    expect(res.body.updated).not.toContain('nonexistent-crate');
  });

  it('rejects missing dependencies array with 400', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/update')
      .send({ cargoToml: VALID_CARGO_TOML })
      .expect(400);

    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('rejects empty dependencies array with 400', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/update')
      .send({ cargoToml: VALID_CARGO_TOML, dependencies: [] })
      .expect(400);

    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('rejects missing cargoToml with 400', async () => {
    const res = await request(app)
      .post('/api/v1/dependencies/update')
      .send({ dependencies: ['soroban-sdk'] })
      .expect(400);

    expect(res.body).toHaveProperty('error', 'Validation failed');
  });
});
