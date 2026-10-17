// The HTTP contract shared with the mobile app (SDD section 9). Plain types, no runtime code.

export type SaleStatus = 'AWAITING_TAP' | 'CHARGING' | 'PAID' | 'FAILED';

export type SaleFailureCode =
  | 'BUYER_UNKNOWN'
  | 'GRANT_MISSING'
  | 'LIMIT_PER_PAYMENT'
  | 'LIMIT_DAILY'
  | 'GRANT_LIMIT'
  | 'WALLET_ERROR';

export type HttpErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'VENDOR_NOT_FOUND'
  | 'BUYER_NOT_FOUND'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_TAKEN'
  | 'WALLET_UNREACHABLE'
  | 'LAST_WALLET'
  | 'SALE_NOT_FOUND'
  | 'SALE_NOT_CHARGEABLE'
  | 'INTERNAL';

export type SaleView = {
  id: string;
  vendorId: string;
  /** The receiving wallet's publicName, else the vendor's registered name. */
  vendorName?: string;
  /** The vendor's wallet the sale receives into; null once that wallet is removed. */
  vendorWalletId: string | null;
  buyerId: string | null;
  /** The buyer's wallet that paid or was refused; null for BUYER_UNKNOWN refusals and once that wallet is removed. */
  buyerWalletId: string | null;
  amount: string;
  amountFormatted: string;
  assetCode: string;
  assetScale: number;
  status: SaleStatus;
  /** What the buyer pays in the buyer's own asset; null until known (cross-asset sales learn it from the quote). */
  debitAmount: string | null;
  debitAmountFormatted: string | null;
  debitAssetCode: string | null;
  debitAssetScale: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  paidAt: string | null;
};

/** One wallet of a buyer (a card in the app). Caps, today's spend and the grant are this wallet's, in its asset. */
export type BuyerWalletView = {
  id: string;
  walletAddress: string;
  /** The publicName in this wallet's address document; null when it publishes none. */
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  perPaymentLimit: string;
  dailyLimit: string;
  spentToday: string;
  remainingToday: string;
  hasGrant: boolean;
  /** What was approved per day in this wallet's grant; null for a grant without limits. */
  grantDailyLimit: string | null;
  /** grantDailyLimit minus spentToday, floored at zero; null when grantDailyLimit is. */
  grantRemainingToday: string | null;
  isDefault: boolean;
};

/**
 * A buyer and their wallets in creation order. The default wallet's fields are repeated at the top level so
 * clients of the one-wallet contract (SDD section 9) keep working.
 */
export type BuyerView = Omit<BuyerWalletView, 'id' | 'isDefault'> & {
  id: string;
  /** The default wallet's publicName, else the name the buyer was registered with. */
  name: string;
  defaultWalletId: string;
  wallets: BuyerWalletView[];
};

/** One receiving wallet of a vendor. A sale is priced in the asset of the wallet it receives into. */
export type VendorWalletView = {
  id: string;
  walletAddress: string;
  /** As BuyerWalletView.publicName. */
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  isDefault: boolean;
};

/** A vendor and their receiving wallets in creation order; the default wallet's address and asset repeat at the top level. */
export type VendorView = Omit<VendorWalletView, 'id' | 'isDefault'> & {
  id: string;
  /** The default wallet's publicName, else the name the vendor was registered with. */
  name: string;
  defaultWalletId: string;
  wallets: VendorWalletView[];
};

export type BuyerSales = { remainingToday: string; sales: SaleView[] };

export type Health = { ok: boolean; clientWalletAddress: string };

/** GET /debug/wallets: the live state of every wallet address the service knows. */
export type DebugWallet = {
  role: 'client' | 'buyer' | 'vendor';
  name: string;
  walletAddress: string;
  reachable: boolean;
  assetCode: string | null;
  assetScale: number | null;
  error: string | null;
  hasGrant: boolean | null;
};

export type DebugWallets = { checkedAt: string; database: 'ok' | 'error'; wallets: DebugWallet[] };

/**
 * GET /vendors/:id/summary, for ONE receiving wallet (the default unless walletId is given) so totals never mix
 * assets. Days and hours are local to DAILY_LIMIT_TZ; week and month end today.
 */
export type SummaryRange = 'today' | 'week' | 'month';

export type VendorSummary = {
  range: SummaryRange;
  from: string;
  to: string;
  assetCode: string;
  assetScale: number;
  paid: { count: number; total: string };
  pending: { count: number; total: string };
  failed: { count: number };
  averageTicket: string;
  buckets: { start: string; count: number; total: string }[];
};

/**
 * GET /vendors/:id/sales: newest first. buyerName is the paying wallet's publicName, else the buyer's registered name;
 * null only for BUYER_UNKNOWN refusals, which have no wallet to point at.
 */
export type VendorSaleView = SaleView & { buyerName: string | null };

export type Envelope<T> =
  | { data: T; error: null }
  | { data: null; error: { code: HttpErrorCode; message: string } };
