import { z } from 'zod';

export const dependencyCheckSchema = z.object({
  cargoToml: z
    .string()
    .min(1, 'Cargo.toml content is required.')
    .max(50_000, 'Cargo.toml must not exceed 50,000 characters.'),
});

export const dependencyUpdateSchema = z.object({
  cargoToml: z
    .string()
    .min(1, 'Cargo.toml content is required.')
    .max(50_000, 'Cargo.toml must not exceed 50,000 characters.'),
  dependencies: z
    .array(z.string().min(1).max(128))
    .min(1, 'At least one dependency name is required.')
    .max(100, 'Cannot update more than 100 dependencies at once.'),
});
