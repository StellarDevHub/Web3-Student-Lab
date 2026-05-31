import { z } from 'zod';

export const contractCompileSchema = z.object({
  sourceCode: z
    .string()
    .min(32, { message: 'Contract source must contain at least 32 characters.' })
    .max(15000, { message: 'Contract source must not exceed 15,000 characters.' }),
  compilerVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, { message: 'Compiler version must follow semantic versioning, e.g. 0.8.10' }),
  optimization: z.boolean().default(false),
  target: z.enum(['solidity', 'evm', 'soroban', 'wasm']),
  entryPoint: z.string().max(128).optional(),
});

export const contractExecutionSchema = z.object({
  contractAddress: z.string().min(32, { message: 'Contract address is required.' }),
  functionName: z.string().min(1, { message: 'Function name is required.' }),
  parameters: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]), { invalid_type_error: 'Parameter values must be primitive types.' })
    .max(50, { message: 'Maximum of 50 parameters allowed.' })
    .optional(),
  gasLimit: z.number().int().positive().max(10_000_000, { message: 'Gas limit must be positive and no more than 10,000,000.' }),
  caller: z.string().max(128).optional(),
});
