import { z } from 'zod';

export const createVestingScheduleSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  tokenName: z.string().min(1, 'Token Name is required'),
  tokenSymbol: z.string().min(1, 'Token Symbol is required'),
  amount: z.number().positive('Vesting amount must be greater than zero'),
  cliffMonths: z.number().int().nonnegative('Cliff period must be non-negative'),
  durationMonths: z.number().int().positive('Vesting duration must be greater than zero'),
  beneficiary: z.string().regex(/^G[a-zA-Z0-9]{55}$/, 'Invalid Stellar public key format'),
});

export const claimVestingTokensSchema = z.object({
  amount: z.number().positive('Claim amount must be greater than zero'),
  simulatedMonthsElapsed: z.number().int().nonnegative().optional(),
});
