export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AccountWithBalance extends Account {
  balance: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  description?: string;
  is_system?: boolean;
}
