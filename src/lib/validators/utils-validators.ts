import { z } from 'zod';

export const uuidSchema = z.uuid('Invalid UUID format');

export const positiveDecimalSchema = z
  .string()
  .regex(
    /^\d+(\.\d+)?$/,
    'Amount must be a positive decimal string e.g. "100.50"',
  )
  .refine(
    (val) => parseFloat(val) > 0,
    'Amount must be greater than zero',
  );