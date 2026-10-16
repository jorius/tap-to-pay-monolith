// The HTTP contract shared with the mobile app (SDD section 9). Plain types, no runtime code.

export type SaleStatus = 'AWAITING_TAP' | 'CHARGING' | 'PAID' | 'FAILED';

export type SaleFailureCode =
  | 'BUYER_UNKNOWN'
  | 'GRANT_MISSING'
  | 'ASSET_MISMATCH'
  | 'LIMIT_PER_PAYMENT'
  | 'LIMIT_DAILY'
  | 'WALLET_ERROR';

export type HttpErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'VENDOR_NOT_FOUND'
  | 'BUYER_NOT_FOUND'
  | 'SALE_NOT_FOUND'
  | 'SALE_NOT_CHARGEABLE'
  | 'INTERNAL';

export type SaleView = {
  id: string;
  vendorId: string;
  vendorName?: string;
  buyerId: string | null;
  amount: string;
  amountFormatted: string;
  assetCode: string;
  assetScale: number;
  status: SaleStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type BuyerView = {
  id: string;
  name: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  perPaymentLimit: string;
  dailyLimit: string;
  spentToday: string;
  remainingToday: string;
  hasGrant: boolean;
};

export type VendorView = {
  id: string;
  name: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
};

export type BuyerSales = { remainingToday: string; sales: SaleView[] };

export type Health = { ok: boolean; clientWalletAddress: string };

export type Envelope<T> =
  | { data: T; error: null }
  | { data: null; error: { code: HttpErrorCode; message: string } };
