import { Request } from 'express';
import { z } from 'zod';
import { validateRequest } from '../src/utils/validation.js';

// Mock Express objects
const mockRequest = (body: Record<string, unknown>) =>
  ({
    body,
  }) as unknown as Request;

const mockResponse = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateRequest', () => {
    const testSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });

    it('should call next() for valid request body', () => {
      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123',
      });
      const res = mockResponse();
      const middleware = validateRequest(testSchema);

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 error for invalid request body', () => {
      const req = mockRequest({
        email: 'invalid-email',
        password: '123',
      });
      const res = mockResponse();
      const middleware = validateRequest(testSchema);

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Invalid email address',
          }),
          expect.objectContaining({
            field: 'password',
            message: 'Too small: expected string to have >=6 characters',
          }),
        ]),
      });
    });

    it('should return 500 error for unexpected errors', () => {
      const req = mockRequest({});
      const res = mockResponse();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middleware = validateRequest(null as any);

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error during validation',
      });
    });
  });
});
