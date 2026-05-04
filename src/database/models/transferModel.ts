import { CreateEntryInput, Entry } from "./entriesModel.js";

export type TransferStatus = 'PENDING' | 'POSTED' | 'VOIDED';

export interface Transfer {
  id: string;
  idempotency_key: string;
  description: string;
  status: TransferStatus;
  metadata: Record<string, unknown> | null;
  posted_at: Date | null;
  voided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}


export interface TransferWithEntries extends Transfer {
  entries: Entry[];
}

export interface CreateTransferInput {
  idempotency_key: string;
  description: string;
  metadata?: Record<string, unknown>;
  entries: CreateEntryInput[];
}