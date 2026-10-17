// The views of SDD section 9; keep them in step with the service's src/contracts.ts.
export type SaleStatus = 'AWAITING_TAP' | 'CHARGING' | 'PAID' | 'FAILED';

// How the buyer reached the charge: a tap on the terminal, or the sale's payment link (WhatsApp or QR).
export type ChargeChannel = 'NFC' | 'LINK' | 'RECURRING';

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
  // What the sale is for, as the vendor typed it; null when none.
  description: string | null;
  // How the buyer reached the charge; null until a charge is attempted.
  chargedVia: ChargeChannel | null;
  createdAt: string;
  paidAt: string | null;
};

// POST /sales/:id/payment-link: the sale's link, shared by WhatsApp or shown as a QR. The sale can still be tapped; the
// first channel that charges it wins.
export type PaymentLinkView = {
  code: string;
  saleId: string;
  // The web page that previews the charge and opens the app; also the QR's content.
  url: string;
  // Opens this app's payment screen directly.
  appUrl: string;
  qrPayload: string;
  qrSvgUrl: string;
  // wa.me with `message` written.
  whatsappUrl: string;
  message: string;
  expiresAt: string;
};

// GET /pay/:code: what the buyer sees before paying a link. Never carries wallet URLs.
export type PaymentRequestView = {
  code: string;
  saleId: string;
  vendorName: string;
  amount: string;
  amountFormatted: string;
  assetCode: string;
  assetScale: number;
  description: string | null;
  status: SaleStatus;
  expiresAt: string;
  // True once expiresAt passed while the sale is unpaid; such a link can no longer be charged.
  expired: boolean;
  failureCode: string | null;
  failureMessage: string | null;
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

// GET /vendors/:id/sales?status=PAID|CHARGING|FAILED&date=YYYY-MM-DD&limit=50&direction=in|out|all: the vendor's
// movements, newest first, AWAITING_TAP left out. IN is a sale received (buyerName); OUT is a recurring payment the vendor
// made (payeeName, and debitAmount is what left its wallet).
export type VendorSaleView = SaleView & { direction: 'IN' | 'OUT'; buyerName: string | null; payeeName: string | null };

// GET /billers: services a buyer can pay every month. The app draws each as a badge in its brand colour.
export type BillerView = {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  textColor: string;
  initials: string;
  // What the reference is called at this service: "Número de contrato", "Número de línea", …
  referenceLabel: string;
  // False when the service has no Interledger wallet configured (BILLER_WALLETS, BILLERS_DEFAULT_WALLET).
  available: boolean;
};

// GET /vendors/:id/payer: the vendor as a payer, for its recurring payments. Each vendor wallet is a payer wallet too;
// one pays once authorized (hasGrant) by running grantCommand in tap-to-pay-svc.
export type PayerWallet = {
  id: string;
  walletAddress: string;
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  hasGrant: boolean;
  isDefault: boolean;
  grantCommand: string;
};
export type VendorPayerView = { buyerId: string; wallets: PayerWallet[] };

// GET /vendors/:id/recurring: one monthly payment of the vendor, in the payee's asset.
export type RecurringView = {
  id: string;
  billerId: string | null;
  payeeName: string;
  payeeWalletAddress: string;
  reference: string | null;
  amount: string;
  amountFormatted: string;
  assetCode: string;
  assetScale: number;
  dayOfMonth: number;
  // The paying wallet, one of the vendor's payer wallets; null when the default one pays.
  walletId: string | null;
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSaleId: string | null;
  lastStatus: SaleStatus | null;
  lastMessage: string | null;
};
