export type EntryDirection = 'DEBIT' | 'CREDIT';

export interface Entry {
  id: string;
  transfer_id: string;
  account_id: string;
  direction: EntryDirection;
  amount: string; // NUMERIC comes back as string from pg driver
  currency: string;
  created_at: Date;
}

export interface CreateEntryInput {
  account_id: string;
  direction: EntryDirection;
  amount: string;
  currency: string;
}