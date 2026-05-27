import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validation Error Response Interface
 */
export interface ValidationErrorResponse {
  error: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Generic Validation Middleware Factory
 * Creates a middleware function that validates request body against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate the request body against the schema
      schema.parse(req.body);

      // If validation passes, continue to next middleware
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Handle Zod validation errors
        const errorResponse: ValidationErrorResponse = {
          error: 'Validation failed',
          details: error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        };

        res.status(400).json(errorResponse);
        return;
      }

      // Handle other unexpected errors
      res.status(500).json({ error: 'Internal server error during validation' });
    }
  };
};

export const validateBody = validateRequest;

/**
 * Validation Middleware for Request Parameters
 * Validates URL parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse: ValidationErrorResponse = {
          error: 'Parameter validation failed',
          details: error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        };

        res.status(400).json(errorResponse);
        return;
      }

      res.status(500).json({ error: 'Internal server error during parameter validation' });
    }
  };
};

/**
 * Validation Middleware for Query Parameters
 * Validates query parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse: ValidationErrorResponse = {
          error: 'Query validation failed',
          details: error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        };

        res.status(400).json(errorResponse);
        return;
      }

      res.status(500).json({ error: 'Internal server error during query validation' });
    }
  };
};
