import express from 'express';
import request from 'supertest';
import { RustValidationService } from '../src/services/rust-validation.js';
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
    expect(result.diagnostics).toEqual([]);
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
    expect(response.body.diagnostics[0].message).toContain('Unclosed');
  });
});
