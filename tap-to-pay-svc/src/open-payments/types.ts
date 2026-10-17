import type { Amount } from '../services/money.js';

export type WalletInfo = {
  id: string;
  /** The name the wallet's owner publishes; null when the document has none. */
  publicName: string | null;
  authServer: string;
  resourceServer: string;
  assetCode: string;
  assetScale: number;
};

export type Quote = { id: string; debitAmount: bigint; assetCode: string; assetScale: number };

export type RotatedToken = { value: string; manage: string };

/** An interactive outgoing-payment grant: capped per day from intervalStart, the wallet sends the buyer to finishUri. */
export type OutgoingGrantRequest = { dailyDebit: bigint; intervalStart: string; finishUri: string; clientNonce: string };

/** A grant waiting for the buyer's consent at `redirect`; the rest continues it once the buyer accepts. */
export type PendingGrant = { redirect: string; interactNonce: string; continueUri: string; continueToken: string };

/** Everything the service asks of the wallets. Services depend on this, never on the SDK. */
export interface OpenPayments {
  getWalletAddress(url: string): Promise<WalletInfo>;
  /** Returns the incoming payment URL. */
  createIncomingPayment(vendor: WalletInfo, amount: Amount): Promise<string>;
  /** The quote id and what it debits from the buyer, in the buyer's asset. */
  createQuote(buyer: WalletInfo, receiverUrl: string): Promise<Quote>;
  /** Returns the outgoing payment URL. */
  createOutgoingPayment(buyer: WalletInfo, quoteId: string, accessToken: string): Promise<string>;
  rotateToken(manageUrl: string, accessToken: string): Promise<RotatedToken>;
  getIncomingPayment(url: string): Promise<{ receivedAmount: bigint; completed: boolean }>;
  /** The buyer's one-time consent for outgoing payments from `wallet` (SDD section 10, step 3). */
  requestOutgoingPaymentGrant(wallet: WalletInfo, request: OutgoingGrantRequest): Promise<PendingGrant>;
  /** Finalizes a consented grant; its token has the same shape as a rotated one. */
  continueGrant(pending: Pick<PendingGrant, 'continueUri' | 'continueToken'>, interactRef: string): Promise<RotatedToken>;
  /** Revokes a grant's access token at its manage URL (GNAP token revocation). */
  revokeToken(manageUrl: string, accessToken: string): Promise<void>;
}

export class WalletError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

/** Rafiki answers an inactive token with 403; 401 is a missing header or a bad signature. */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof WalletError && (err.status === 401 || err.status === 403);
}

export function isClientError(err: unknown): boolean {
  return err instanceof WalletError && err.status !== undefined && err.status >= 400 && err.status < 500;
}

export function toWalletError(err: unknown): WalletError {
  if (err instanceof WalletError) return err;
  const e = (err ?? {}) as { description?: unknown; message?: unknown; status?: unknown };
  const message =
    (typeof e.description === 'string' && e.description) ||
    (typeof e.message === 'string' && e.message) ||
    'Wallet request failed';
  return new WalletError(message, typeof e.status === 'number' ? e.status : undefined);
}
