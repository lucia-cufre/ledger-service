import { z } from 'zod';

export const accountTypeSchema = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
]);

export const createAccountSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be under 255 characters')
    .trim(),
  type: accountTypeSchema,
  currency: z
    .string()
    .min(2, 'Currency code too short')
    .max(10, 'Currency code too long')
    .toUpperCase(),
  description: z
    .string()
    .max(500)
    .optional(),
  is_system: z
    .boolean()
    .optional()
    .default(false),
});