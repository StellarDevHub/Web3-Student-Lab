import { Request } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { app } from '../src/index.js';
import { validateRequest } from '../src/utils/validation.js';

const mockRequest = (body: Record<string, unknown>) => ({ body } as unknown as Request);
const mockResponse = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

describe('Contract Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject compile requests with invalid source and version', async () => {
    const schema = z.object({
      sourceCode: z.string().min(32),
      compilerVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
      optimization: z.boolean(),
      target: z.enum(['solidity', 'evm', 'soroban', 'wasm']),
    });

    const req = mockRequest({ sourceCode: 'short', compilerVersion: 'bad' });
    const res = mockResponse();
    const middleware = validateRequest(schema);

    middleware(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return contract compile endpoint validation errors', async () => {
    const response = await request(app)
      .post('/api/v1/contracts/compile')
      .send({ sourceCode: 'short', compilerVersion: 'bad', optimization: false, target: 'solidity' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Validation failed');
    expect(response.body.details).toEqual(expect.any(Array));
  });
});
