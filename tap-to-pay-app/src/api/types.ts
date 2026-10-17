// The views of SDD section 9; keep them in step with the service's src/contracts.ts.
export type SaleStatus = 'AWAITING_TAP' | 'CHARGING' | 'PAID' | 'FAILED';

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
  // Which of the vendor's wallets receives: the receiving wallet when the sale was created; null once it is removed.
  vendorWalletId: string | null;
  // Which of the buyer's wallets paid; null until the claim (and for refusals with no known buyer).
  buyerWalletId: string | null;
  // What the buyer pays in the buyer's own asset; null until known (a cross-asset sale learns it from the quote).
  debitAmount: string | null;
  debitAmountFormatted: string | null;
  debitAssetCode: string | null;
  debitAssetScale: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  paidAt: string | null;
};

// One wallet (card) of a buyer: its own asset, caps and grant.
export type BuyerWalletView = {
  id: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  perPaymentLimit: string;
  dailyLimit: string;
  spentToday: string;
  remainingToday: string;
  hasGrant: boolean;
  // What the buyer authorized per day in the wallet's consent (wallet's asset); null for a grant without a debit limit.
  grantDailyLimit: string | null;
  grantRemainingToday: string | null;
  // The name the wallet address publishes (its public document); null when it has none.
  publicName: string | null;
  isDefault: boolean;
};

// The buyer with every wallet in creation order; the default wallet's fields are repeated at the top level. name is the
// default wallet's publicName, else the name the buyer was registered with.
export type BuyerView = Omit<BuyerWalletView, 'id' | 'isDefault'> & {
  id: string;
  name: string;
  defaultWalletId: string;
  wallets: BuyerWalletView[];
};

// One receiving wallet of a vendor; the default one receives new sales.
export type VendorWalletView = {
  id: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  publicName: string | null;
  isDefault: boolean;
};

// The vendor with every receiving wallet in creation order; the default wallet's fields are repeated at the top level.
// name is the default wallet's publicName, else the registered name; sales name both sides the same way.
export type VendorView = Omit<VendorWalletView, 'id' | 'isDefault'> & {
  id: string;
  name: string;
  defaultWalletId: string;
  wallets: VendorWalletView[];
};

export type Health = { ok: boolean; clientWalletAddress: string };

export type BuyerSales = { remainingToday: string; sales: SaleView[] };

// GET /debug/wallets: the service's live view of the Test Wallet addresses it knows (debug surface, not in SDD §9).
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

// GET /vendors/:id/summary?range=today|week|month: the dashboard of the design (not in SDD §9). Days and hours are local
// to DAILY_LIMIT_TZ; week is the last 7 local days and month the last 30, both ending today.
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

// GET /vendors/:id/sales?status=PAID|CHARGING|FAILED&date=YYYY-MM-DD&limit=50: newest first, AWAITING_TAP left out.
export type VendorSaleView = SaleView & { buyerName: string | null };
