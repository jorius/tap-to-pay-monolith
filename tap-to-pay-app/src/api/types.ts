// The views of SDD section 9; keep them in step with the service's src/services/views.ts.
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
