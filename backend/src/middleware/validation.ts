import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError, ApiFieldError, sendErrorEnvelope } from '../utils/apiError.js';

// Subscription creation validation schema
export const subscriptionCreateSchema = z.object({
  tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  autoRenew: z.boolean().optional().default(false),
});

// Subscription plan update validation schema
export const subscriptionUpdateSchema = z.object({
  tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().min(1, 'Description is required'),
  price: z.number().positive('Price must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  features: z.array(z.string()).min(1, 'At least one feature is required'),
  maxUsers: z.number().positive('Max users must be positive'),
  isActive: z.boolean(),
});

/**
 * Map Zod issues to envelope field errors.
 * Only the field path and the reason are exposed — never the submitted value.
 */
export const toFieldErrors = (error: z.ZodError): ApiFieldError[] =>
  error.issues.map((issue: z.ZodIssue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

// Validation middleware factory — emits the versioned error envelope.
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Route params and body are validated together; the merged result
      // replaces req.body so handlers read one typed object.
      const validatedData = schema.parse({ ...req.params, ...req.body });
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendErrorEnvelope(
          req,
          res,
          ApiError.validationFailed('Request validation failed', toFieldErrors(error))
        );
      }

      // Unexpected failure inside the schema itself — never leak the detail.
      return sendErrorEnvelope(req, res, ApiError.internal(undefined, error));
    }
  };
};

// Specific validation middleware
export const validateSubscriptionCreate = validate(subscriptionCreateSchema);
export const validateSubscriptionUpdate = validate(subscriptionUpdateSchema);
