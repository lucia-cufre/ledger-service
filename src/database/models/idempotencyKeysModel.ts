export interface IdempotencyKey {
  key: string;
  request_hash: string;
  response_body: Record<string, unknown>;
  response_status: number;
  created_at: Date;
  expires_at: Date;
}