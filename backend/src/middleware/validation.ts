import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../utils/response.js';

// Subscription creation validation schema
export const subscriptionCreateSchema = z.object({
  tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  autoRenew: z.boolean().optional().default(false)
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
  isActive: z.boolean()
});

// Validation middleware factory
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json(
          ApiResponse.error('Validation failed', errorMessages)
        );
      }
      
      return res.status(500).json(
        ApiResponse.error('Internal server error')
      );
    }
  };
};

// Specific validation middleware
export const validateSubscriptionCreate = validate(subscriptionCreateSchema);
export const validateSubscriptionUpdate = validate(subscriptionUpdateSchema);
