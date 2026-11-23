import { z } from 'zod';

export const contractCompileSchema = z.object({
  sourceCode: z
    .string()
    .min(32, 'Contract source must contain at least 32 characters.')
    .max(15000, 'Contract source must not exceed 15,000 characters.'),
  compilerVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Compiler version must follow semantic versioning, e.g. 0.8.10'),
  optimization: z.boolean().default(false),
  target: z.enum(['solidity', 'evm', 'soroban', 'wasm']),
  entryPoint: z.string().max(128).optional(),
  projectId: z.string().max(128).optional(),
});

export const contractCancelSchema = z.object({
  cancellationId: z
    .string()
    .uuid({ message: 'cancellationId must be a valid UUID.' }),
});

export const contractExecutionSchema = z.object({
  contractAddress: z.string().min(32, 'Contract address is required.'),
  functionName: z.string().min(1, 'Function name is required.'),
  parameters: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .max(50, 'Maximum of 50 parameters allowed.')

    .optional(),
  gasLimit: z.number().int().positive().max(10_000_000, 'Gas limit must be positive and no more than 10,000,000.'),
  caller: z.string().max(128).optional(),
  /** Base64-encoded WASM binary — when present, execution runs in the sandboxed WASM engine (#1420). */
  wasmBase64: z
    .string()
    .max(2_000_000, 'wasmBase64 must not exceed ~1.5MB of encoded WASM.')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'wasmBase64 must be valid base64.')
    .optional(),
  memoryLimitMb: z.number().positive().max(128, 'memoryLimitMb cannot exceed the 128MB sandbox ceiling.').optional(),
});
