import type { Amount } from '../services/money.js';

export type WalletInfo = {
  id: string;
  authServer: string;
  resourceServer: string;
  assetCode: string;
  assetScale: number;
};

export type Quote = { id: string; debitAmount: bigint; assetCode: string; assetScale: number };

export type RotatedToken = { value: string; manage: string };

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
