import express from 'express';
import request from 'supertest';
import {
  RUST_VALIDATION_LIMITS,
  RustValidationService,
} from '../src/services/rust-validation.js';
import playgroundRouter from '../src/routes/playground.routes.js';

describe('Playground validation', () => {
  it('detects syntax-like issues in Rust code', async () => {
    const result = await RustValidationService.validateCode(`#[contract]
pub struct BrokenContract;

impl BrokenContract {
    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "hello")
    }
`);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].message).toContain('Unclosed block');
  });

  it('returns a clean validation result for valid Rust code', async () => {
    const result = await RustValidationService.validateCode(`#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "hello")
    }
}`);

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('valid');
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts source at the UTF-8 byte limit', async () => {
    const code = 'a'.repeat(RUST_VALIDATION_LIMITS.maxInputBytes);

    const result = await RustValidationService.validateCode(code);

    expect(result).toMatchObject({
      isValid: true,
      status: 'valid',
      diagnostics: [],
    });
  });

  it('rejects source over the UTF-8 byte limit without echoing it', async () => {
    const code = '🚀'.repeat(RUST_VALIDATION_LIMITS.maxInputBytes / 2);

    const result = await RustValidationService.validateCode(code);

    expect(result).toMatchObject({
      isValid: false,
      status: 'rejected',
      diagnostics: [{ code: 'input-too-large', severity: 'error' }],
    });
    expect(JSON.stringify(result)).not.toContain(code);
  });

  it('stops after the configured diagnostic limit', async () => {
    const result = await RustValidationService.validateCode(
      ')'.repeat(RUST_VALIDATION_LIMITS.maxDiagnostics + 10)
    );

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics).toHaveLength(RUST_VALIDATION_LIMITS.maxDiagnostics);
    expect(result.diagnostics.at(-1)?.code).toBe('diagnostic-limit-exceeded');
  });

  it('returns a structured timeout diagnostic when the deadline is exceeded', async () => {
    let clockCalls = 0;
    const clock = () => {
      clockCalls += 1;
      return clockCalls < 3 ? 0 : RUST_VALIDATION_LIMITS.timeoutMs;
    };

    const result = await RustValidationService.validateCode('\n'.repeat(512), clock);

    expect(result).toMatchObject({
      isValid: false,
      status: 'timed_out',
      diagnostics: [{ code: 'validation-timeout', severity: 'error' }],
    });
  });

  it('exposes diagnostics through the API', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/playground', playgroundRouter);

    const response = await request(app)
      .post('/api/v1/playground/validate')
      .send({ code: 'fn broken(' })
      .expect(200);

    expect(response.body.isValid).toBe(false);
    expect(response.body.status).toBe('invalid');
    expect(response.body.diagnostics[0].message).toContain('Unclosed');
  });

  it('rejects oversized API input with a structured 413 response', async () => {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/v1/playground', playgroundRouter);

    const response = await request(app)
      .post('/api/v1/playground/validate')
      .send({ code: 'a'.repeat(RUST_VALIDATION_LIMITS.maxInputBytes + 1) })
      .expect(413);

    expect(response.body).toMatchObject({
      isValid: false,
      status: 'rejected',
      diagnostics: [{ code: 'input-too-large' }],
    });
  });

  it('does not expose internal exception details through the API', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/playground', playgroundRouter);
    const validation = jest
      .spyOn(RustValidationService, 'validateCode')
      .mockRejectedValueOnce(new Error('private source detail'));

    const response = await request(app)
      .post('/api/v1/playground/validate')
      .send({ code: 'fn main() {}' })
      .expect(500);

    expect(response.body).toEqual({ error: 'Playground validation failed' });
    expect(JSON.stringify(response.body)).not.toContain('private source detail');
    validation.mockRestore();
  });
});
