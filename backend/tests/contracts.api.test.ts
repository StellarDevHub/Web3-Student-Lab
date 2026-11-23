import request from 'supertest';
import { app } from '../src/index.js';

describe('Contracts API', () => {
  it('should compile valid contract request and return compiled result', async () => {
    const response = await request(app)
      .post('/api/v1/contracts/compile')
      .send({
        sourceCode: `pragma solidity ^0.8.0;
contract HelloWorld { function execute() public pure returns (string memory) { return 'hello'; } }`,
        compilerVersion: '0.8.10',
        optimization: false,
        target: 'solidity',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'success',
      compiled: true,
      compilerVersion: '0.8.10',
      optimization: false,
      target: 'solidity',
    });
  });

  it('should reject invalid contract compile payload with 400', async () => {
    const response = await request(app)
      .post('/api/v1/contracts/compile')
      .send({
        sourceCode: 'short',
        compilerVersion: 'bad-version',
        optimization: false,
        target: 'solidity',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation failed');
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'sourceCode' }),
      expect.objectContaining({ field: 'compilerVersion' }),
    ]));
  });

  it('should execute contract simulation and return execution metrics', async () => {
    const response = await request(app)
      .post('/api/v1/contracts/execute')
      .send({
        contractAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        functionName: 'execute',
        parameters: [1, 'abc'],
        gasLimit: 100000,
        caller: 'test-suite',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'success',
      functionName: 'execute',
      caller: 'test-suite',
    });
    expect(response.body.gasUsed).toBeGreaterThan(0);
    expect(response.body.durationMs).toBeGreaterThanOrEqual(0);
  });
});
