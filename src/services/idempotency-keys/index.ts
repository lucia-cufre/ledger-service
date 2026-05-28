import { db } from "../../database/client.js";
import { TransferWithEntries } from "../../database/models/transferModel.js";

export async function storeIdempotencyKey(
  key: string,
  requestHash: string,
  responseStatus: number,
  responseBody: Record<string, TransferWithEntries>,
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db('idempotency_keys').insert({
    key,
    request_hash: requestHash,
    response_body: JSON.stringify(responseBody),
    response_status: responseStatus,
    expires_at: expiresAt,
  });
}