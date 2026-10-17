import type { SaleStatus } from '../contracts.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { DayRange } from '../services/limits.js';

export type BuyerRow = {
  id: string;
  name: string;
  /** One of the buyer's wallets, kept so by the service; buyerView falls back to the oldest if it is stale. */
  defaultWalletId: string | null;
  createdAt: Date;
};

/** One wallet address of a buyer. Caps and the grant live here, in this wallet's asset. */
export type BuyerWalletRow = {
  id: string;
  buyerId: string;
  walletAddress: string;
  /** The wallet address document's publicName, saved at registration and refreshed at service start. */
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  perPaymentLimit: bigint;
  dailyLimit: bigint;
  // shortcut: stored in plain text; encrypt at rest before any real user (SDD section 11).
  grantAccessToken: string | null;
  grantManageUrl: string | null;
  /** The grant's debitAmount per day, in this wallet's asset; null for a grant without limits. */
  grantDailyLimit: bigint | null;
  createdAt: Date;
};

/** Wallets in creation order. */
export type BuyerWithWallets = BuyerRow & { wallets: BuyerWalletRow[] };
export type WalletWithBuyer = BuyerWalletRow & { buyer: BuyerRow };

export type VendorRow = {
  id: string;
  name: string;
  /** One of the vendor's wallets, kept so by the service; vendorView falls back to the oldest if it is stale. */
  defaultWalletId: string | null;
  /** MERCHANT sells with a terminal; BILLER is a service buyers pay monthly, left out of the vendor list. */
  kind: string;
  createdAt: Date;
};

/** One receiving wallet address of a vendor. */
export type VendorWalletRow = {
  id: string;
  vendorId: string;
  walletAddress: string;
  /** As BuyerWalletRow.publicName. */
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  createdAt: Date;
};

/** Wallets in creation order. */
export type VendorWithWallets = VendorRow & { wallets: VendorWalletRow[] };

export type SaleRow = {
  id: string;
  vendorId: string;
  /** The vendor's wallet the sale receives into; null once that wallet is removed. */
  vendorWalletId: string | null;
  buyerId: string | null;
  /** The buyer's wallet that paid or was refused; null for BUYER_UNKNOWN refusals and once that wallet is deleted. */
  buyerWalletId: string | null;
  amount: bigint;
  assetCode: string;
  assetScale: number;
  /** What the buyer pays, in the paying wallet's asset; the daily cap sums this. */
  debitAmount: bigint | null;
  debitAssetCode: string | null;
  debitAssetScale: number | null;
  status: SaleStatus;
  incomingPaymentUrl: string | null;
  quoteId: string | null;
  outgoingPaymentUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** What the sale is for; shown on the payment link. */
  description: string | null;
  /** The payment link's public code and when it stops working; null until a link is created. */
  payCode: string | null;
  payCodeExpiresAt: Date | null;
  /** NFC or LINK: how the buyer reached the charge; null until a charge is attempted. */
  chargedVia: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

/** The registered names, and the publicName of the sale's own wallet (null once it is removed). */
export type SaleWithVendor = SaleRow & { vendorName: string; vendorPublicName: string | null };
export type SaleWithBuyer = SaleRow & { buyerName: string | null; buyerPublicName: string | null };
export type VendorSaleQuery = { statuses: SaleStatus[]; from?: Date; to?: Date; limit?: number; walletId?: string };
export type SalePatch = Partial<Omit<SaleRow, 'id' | 'vendorId' | 'createdAt'>>;
export type NewSale = Pick<SaleRow, 'vendorId' | 'vendorWalletId' | 'amount' | 'assetCode' | 'assetScale' | 'createdAt'> &
  Partial<Pick<SaleRow, 'description'>>;
export type Limits = { perPaymentLimit: bigint; dailyLimit: bigint };
/** A token rotation passes only the tokens, so the stored grantDailyLimit survives it. */
export type GrantTokens = { grantAccessToken: string; grantManageUrl: string; grantDailyLimit?: bigint };
export type WalletAsset = { walletAddress: string; publicName: string | null; assetCode: string; assetScale: number };

/** A buyer's monthly payment to a service; each run is a sale to the payee's vendor. */
export type RecurringRow = {
  id: string;
  buyerId: string;
  /** The paying wallet; null once removed, then the buyer's default wallet pays. */
  walletId: string | null;
  /** Catalog id (epm, claro, …); null for a payee the buyer typed. */
  billerId: string | null;
  payeeName: string;
  payeeWalletAddress: string;
  payeeAssetCode: string;
  payeeAssetScale: number;
  reference: string | null;
  /** In the payee's asset, smallest unit. */
  amount: bigint;
  /** 1 to 28. */
  dayOfMonth: number;
  active: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastSaleId: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  createdAt: Date;
};
export type NewRecurring = Omit<
  RecurringRow,
  'id' | 'active' | 'lastRunAt' | 'lastSaleId' | 'lastStatus' | 'lastMessage' | 'createdAt'
>;
export type RecurringPatch = Partial<
  Pick<RecurringRow, 'active' | 'nextRunAt' | 'lastRunAt' | 'lastSaleId' | 'lastStatus' | 'lastMessage'>
>;
export type NewWallet = WalletAsset & Limits;

const WALLET_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

export interface Repo {
  /** By name, each with their wallets in creation order. */
  listVendors(): Promise<VendorWithWallets[]>;
  getVendor(id: string): Promise<VendorWithWallets | null>;
  /** The vendor wallet registered with this address, whoever owns it. */
  getVendorWalletByAddress(walletAddress: string): Promise<VendorWalletRow | null>;
  /** As upsertBuyerWithWallet, for the vendor owning `wallet.walletAddress`. */
  upsertVendorWithWallet(name: string, wallet: WalletAsset): Promise<VendorWithWallets>;
  /**
   * The vendor that receives into `wallet.walletAddress`: whoever already owns that address (never renamed), else a new
   * BILLER vendor named `name`.
   */
  ensureBillerVendor(name: string, wallet: WalletAsset): Promise<VendorWithWallets>;
  /** A buyer's recurring payments, oldest first. */
  listRecurring(buyerId: string): Promise<RecurringRow[]>;
  getRecurring(id: string): Promise<RecurringRow | null>;
  createRecurring(input: NewRecurring): Promise<RecurringRow>;
  updateRecurring(id: string, patch: RecurringPatch): Promise<RecurringRow>;
  deleteRecurring(id: string): Promise<void>;
  /** Active ones whose nextRunAt has come. */
  listDueRecurring(now: Date): Promise<RecurringRow[]>;
  /** Moves nextRunAt from `from` to `next` only if it is still `from`: false when another run claimed it first. */
  claimRecurringRun(id: string, from: Date, next: Date): Promise<boolean>;
  createVendorWallet(vendorId: string, wallet: WalletAsset): Promise<VendorWalletRow>;
  setDefaultVendorWallet(vendorId: string, walletId: string): Promise<void>;
  /** Its sales keep their vendor and lose the wallet link. */
  deleteVendorWallet(walletId: string): Promise<void>;
  updateVendorWalletPublicName(walletId: string, publicName: string | null): Promise<void>;
  /** By name, each with their wallets in creation order. */
  listBuyers(): Promise<BuyerWithWallets[]>;
  getBuyer(id: string): Promise<BuyerWithWallets | null>;
  /** The wallet registered with this address, whoever owns it. */
  getWalletByAddress(walletAddress: string): Promise<WalletWithBuyer | null>;
  /**
   * The buyer owning `wallet.walletAddress`. A new address creates the buyer with it as the first, default wallet;
   * a known one renames its buyer and updates the wallet's publicName and asset, keeping caps and grant.
   */
  upsertBuyerWithWallet(name: string, wallet: NewWallet): Promise<BuyerWithWallets>;
  addWallet(buyerId: string, wallet: NewWallet): Promise<BuyerWalletRow>;
  setDefaultWallet(buyerId: string, walletId: string): Promise<void>;
  updateWalletLimits(walletId: string, limits: Limits): Promise<BuyerWalletRow>;
  updateWalletGrant(walletId: string, grant: GrantTokens): Promise<BuyerWalletRow>;
  updateWalletPublicName(walletId: string, publicName: string | null): Promise<void>;
  /** Its sales keep their buyer and lose the wallet link. */
  deleteWallet(walletId: string): Promise<void>;
  createSale(input: NewSale): Promise<SaleRow>;
  getSale(id: string): Promise<SaleRow | null>;
  getSaleByPayCode(payCode: string): Promise<SaleRow | null>;
  updateSale(id: string, patch: SalePatch): Promise<SaleRow>;
  /** Applies `patch` only if the sale is still `from`; the row if it did, null otherwise. */
  transitionSale(id: string, from: SaleStatus, patch: SalePatch): Promise<SaleRow | null>;
  /** Sum of debitAmount over CHARGING and PAID sales paid by the wallet, created inside `range`. */
  sumSpent(walletId: string, range: DayRange): Promise<bigint>;
  /** Newest first, with the vendor's names; only the given wallet's sales when walletId is set. */
  listBuyerSales(buyerId: string, limit: number, walletId?: string): Promise<SaleWithVendor[]>;
  /** The vendor's sales in `statuses` created inside [from, to), newest first, with the buyer's names; one wallet's with walletId. */
  listVendorSales(vendorId: string, query: VendorSaleQuery): Promise<SaleWithBuyer[]>;
}

export class PrismaRepo implements Repo {
  constructor(private readonly db: PrismaClient) {}

  listVendors() {
    return this.db.vendor.findMany({ orderBy: { name: 'asc' }, include: { wallets: { orderBy: WALLET_ORDER } } });
  }

  getVendor(id: string) {
    return this.db.vendor.findUnique({ where: { id }, include: { wallets: { orderBy: WALLET_ORDER } } });
  }

  getVendorWalletByAddress(walletAddress: string) {
    return this.db.vendorWallet.findUnique({ where: { walletAddress } });
  }

  async upsertVendorWithWallet(name: string, wallet: WalletAsset) {
    const vendorId = await this.db.$transaction(async (tx) => {
      const existing = await tx.vendorWallet.findUnique({ where: { walletAddress: wallet.walletAddress } });
      if (existing) {
        await tx.vendor.update({ where: { id: existing.vendorId }, data: { name } });
        await tx.vendorWallet.update({
          where: { id: existing.id },
          data: { publicName: wallet.publicName, assetCode: wallet.assetCode, assetScale: wallet.assetScale },
        });
        return existing.vendorId;
      }
      const created = await tx.vendor.create({ data: { name, wallets: { create: wallet } }, include: { wallets: true } });
      await tx.vendor.update({ where: { id: created.id }, data: { defaultWalletId: created.wallets[0].id } });
      return created.id;
    });
    return (await this.getVendor(vendorId))!;
  }

  async ensureBillerVendor(name: string, wallet: WalletAsset) {
    const vendorId = await this.db.$transaction(async (tx) => {
      const existing = await tx.vendorWallet.findUnique({ where: { walletAddress: wallet.walletAddress } });
      if (existing) return existing.vendorId;
      const created = await tx.vendor.create({
        data: { name, kind: 'BILLER', wallets: { create: wallet } },
        include: { wallets: true },
      });
      await tx.vendor.update({ where: { id: created.id }, data: { defaultWalletId: created.wallets[0].id } });
      return created.id;
    });
    return (await this.getVendor(vendorId))!;
  }

  listRecurring(buyerId: string) {
    return this.db.recurringPayment.findMany({ where: { buyerId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  getRecurring(id: string) {
    return this.db.recurringPayment.findUnique({ where: { id } });
  }

  createRecurring(input: NewRecurring) {
    return this.db.recurringPayment.create({ data: input });
  }

  updateRecurring(id: string, patch: RecurringPatch) {
    return this.db.recurringPayment.update({ where: { id }, data: patch });
  }

  async deleteRecurring(id: string) {
    await this.db.recurringPayment.delete({ where: { id } });
  }

  listDueRecurring(now: Date) {
    return this.db.recurringPayment.findMany({ where: { active: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' } });
  }

  async claimRecurringRun(id: string, from: Date, next: Date) {
    const { count } = await this.db.recurringPayment.updateMany({ where: { id, nextRunAt: from }, data: { nextRunAt: next } });
    return count === 1;
  }

  createVendorWallet(vendorId: string, wallet: WalletAsset) {
    return this.db.vendorWallet.create({ data: { ...wallet, vendorId } });
  }

  async setDefaultVendorWallet(vendorId: string, walletId: string) {
    await this.db.vendor.update({ where: { id: vendorId }, data: { defaultWalletId: walletId } });
  }

  async deleteVendorWallet(walletId: string) {
    // Sale.vendorWalletId is ON DELETE SET NULL, so the sales stay with their vendor.
    await this.db.vendorWallet.delete({ where: { id: walletId } });
  }

  async updateVendorWalletPublicName(walletId: string, publicName: string | null) {
    await this.db.vendorWallet.update({ where: { id: walletId }, data: { publicName } });
  }

  listBuyers() {
    return this.db.buyer.findMany({ orderBy: { name: 'asc' }, include: { wallets: { orderBy: WALLET_ORDER } } });
  }

  getBuyer(id: string) {
    return this.db.buyer.findUnique({ where: { id }, include: { wallets: { orderBy: WALLET_ORDER } } });
  }

  getWalletByAddress(walletAddress: string) {
    return this.db.buyerWallet.findUnique({ where: { walletAddress }, include: { buyer: true } });
  }

  async upsertBuyerWithWallet(name: string, wallet: NewWallet) {
    const buyerId = await this.db.$transaction(async (tx) => {
      const existing = await tx.buyerWallet.findUnique({ where: { walletAddress: wallet.walletAddress } });
      if (existing) {
        await tx.buyer.update({ where: { id: existing.buyerId }, data: { name } });
        await tx.buyerWallet.update({
          where: { id: existing.id },
          data: { publicName: wallet.publicName, assetCode: wallet.assetCode, assetScale: wallet.assetScale },
        });
        return existing.buyerId;
      }
      const created = await tx.buyer.create({ data: { name, wallets: { create: wallet } }, include: { wallets: true } });
      await tx.buyer.update({ where: { id: created.id }, data: { defaultWalletId: created.wallets[0].id } });
      return created.id;
    });
    return (await this.getBuyer(buyerId))!;
  }

  addWallet(buyerId: string, wallet: NewWallet) {
    return this.db.buyerWallet.create({ data: { ...wallet, buyerId } });
  }

  async setDefaultWallet(buyerId: string, walletId: string) {
    await this.db.buyer.update({ where: { id: buyerId }, data: { defaultWalletId: walletId } });
  }

  updateWalletLimits(walletId: string, limits: Limits) {
    return this.db.buyerWallet.update({ where: { id: walletId }, data: limits });
  }

  updateWalletGrant(walletId: string, grant: GrantTokens) {
    return this.db.buyerWallet.update({ where: { id: walletId }, data: grant });
  }

  async updateWalletPublicName(walletId: string, publicName: string | null) {
    await this.db.buyerWallet.update({ where: { id: walletId }, data: { publicName } });
  }

  async deleteWallet(walletId: string) {
    // Sale.buyerWalletId is ON DELETE SET NULL, so the sales stay with their buyer.
    await this.db.buyerWallet.delete({ where: { id: walletId } });
  }

  createSale(input: NewSale) {
    return this.db.sale.create({ data: input });
  }

  getSale(id: string) {
    return this.db.sale.findUnique({ where: { id } });
  }

  getSaleByPayCode(payCode: string) {
    return this.db.sale.findUnique({ where: { payCode } });
  }

  updateSale(id: string, patch: SalePatch) {
    return this.db.sale.update({ where: { id }, data: patch });
  }

  async transitionSale(id: string, from: SaleStatus, patch: SalePatch) {
    const { count } = await this.db.sale.updateMany({ where: { id, status: from }, data: patch });
    return count === 1 ? this.getSale(id) : null;
  }

  async sumSpent(walletId: string, range: DayRange) {
    const { _sum } = await this.db.sale.aggregate({
      _sum: { debitAmount: true },
      where: {
        buyerWalletId: walletId,
        status: { in: ['CHARGING', 'PAID'] },
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    return _sum.debitAmount ?? 0n;
  }

  async listBuyerSales(buyerId: string, limit: number, walletId?: string) {
    const rows = await this.db.sale.findMany({
      where: { buyerId, buyerWalletId: walletId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { vendor: { select: { name: true } }, vendorWallet: { select: { publicName: true } } },
    });
    return rows.map(({ vendor, vendorWallet, ...sale }) => ({
      ...sale,
      vendorName: vendor.name,
      vendorPublicName: vendorWallet?.publicName ?? null,
    }));
  }

  // shortcut: no index on vendorId or vendorWalletId, so this scans Sale; add @@index([vendorWalletId, createdAt])
  // past demo volume.
  async listVendorSales(vendorId: string, { statuses, from, to, limit, walletId }: VendorSaleQuery) {
    const rows = await this.db.sale.findMany({
      where: { vendorId, vendorWalletId: walletId, status: { in: statuses }, createdAt: { gte: from, lt: to } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { buyer: { select: { name: true } }, buyerWallet: { select: { publicName: true } } },
    });
    return rows.map(({ buyer, buyerWallet, ...sale }) => ({
      ...sale,
      buyerName: buyer?.name ?? null,
      buyerPublicName: buyerWallet?.publicName ?? null,
    }));
  }
}
