import { z } from 'zod';
import { positiveDecimalSchema, uuidSchema } from './utils-validators.js';

export const entrySchema = z.object({
  account_id: uuidSchema,
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: positiveDecimalSchema,
  currency: z
    .string()
    .min(2)
    .max(10)
    .toUpperCase(),
});

export const createTransferSchema = z.object({
  idempotency_key: uuidSchema,
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500)
    .trim(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  entries: z
    .array(entrySchema)
    .min(2, 'A transfer must have at least 2 entries')
    .max(20, 'A transfer cannot have more than 20 entries'),
});

export const voidTransferSchema = z.object({
  reason: z
    .string()
    .min(1, 'Void reason is required')
    .max(500)
    .trim(),
});