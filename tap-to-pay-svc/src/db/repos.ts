import type { SaleStatus } from '../contracts.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { DayRange } from '../services/limits.js';

export type BuyerRow = {
  id: string;
  name: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  perPaymentLimit: bigint;
  dailyLimit: bigint;
  // shortcut: stored in plain text; encrypt at rest before any real user (SDD section 11).
  grantAccessToken: string | null;
  grantManageUrl: string | null;
  createdAt: Date;
};

export type VendorRow = {
  id: string;
  name: string;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  createdAt: Date;
};

export type SaleRow = {
  id: string;
  vendorId: string;
  buyerId: string | null;
  amount: bigint;
  assetCode: string;
  assetScale: number;
  /** What the buyer pays, in the buyer's asset; the daily cap sums this. */
  debitAmount: bigint | null;
  debitAssetCode: string | null;
  debitAssetScale: number | null;
  status: SaleStatus;
  incomingPaymentUrl: string | null;
  quoteId: string | null;
  outgoingPaymentUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

export type SaleWithVendor = SaleRow & { vendorName: string };
export type SalePatch = Partial<Omit<SaleRow, 'id' | 'vendorId' | 'createdAt'>>;
export type NewSale = Pick<SaleRow, 'vendorId' | 'amount' | 'assetCode' | 'assetScale' | 'createdAt'>;
export type Limits = { perPaymentLimit: bigint; dailyLimit: bigint };
export type GrantTokens = { grantAccessToken: string; grantManageUrl: string };
export type WalletParty = { name: string; walletAddress: string; assetCode: string; assetScale: number };

export interface Repo {
  listVendors(): Promise<VendorRow[]>;
  getVendor(id: string): Promise<VendorRow | null>;
  upsertVendor(input: WalletParty): Promise<VendorRow>;
  listBuyers(): Promise<BuyerRow[]>;
  getBuyer(id: string): Promise<BuyerRow | null>;
  getBuyerByWallet(walletAddress: string): Promise<BuyerRow | null>;
  /** Creates with the given limits; on re-run updates only name and asset. */
  upsertBuyer(input: WalletParty & Limits): Promise<BuyerRow>;
  updateBuyerLimits(id: string, limits: Limits): Promise<BuyerRow>;
  updateBuyerGrant(id: string, grant: GrantTokens): Promise<BuyerRow>;
  createSale(input: NewSale): Promise<SaleRow>;
  getSale(id: string): Promise<SaleRow | null>;
  updateSale(id: string, patch: SalePatch): Promise<SaleRow>;
  /** Applies `patch` only if the sale is still `from`; the row if it did, null otherwise. */
  transitionSale(id: string, from: SaleStatus, patch: SalePatch): Promise<SaleRow | null>;
  /** Sum of debitAmount over CHARGING and PAID sales of the buyer created inside `range`. */
  sumSpent(buyerId: string, range: DayRange): Promise<bigint>;
  listBuyerSales(buyerId: string, limit: number): Promise<SaleWithVendor[]>;
}

export class PrismaRepo implements Repo {
  constructor(private readonly db: PrismaClient) {}

  listVendors() {
    return this.db.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  getVendor(id: string) {
    return this.db.vendor.findUnique({ where: { id } });
  }

  upsertVendor(input: WalletParty) {
    const { name, assetCode, assetScale } = input;
    return this.db.vendor.upsert({
      where: { walletAddress: input.walletAddress },
      create: input,
      update: { name, assetCode, assetScale },
    });
  }

  listBuyers() {
    return this.db.buyer.findMany({ orderBy: { name: 'asc' } });
  }

  getBuyer(id: string) {
    return this.db.buyer.findUnique({ where: { id } });
  }

  getBuyerByWallet(walletAddress: string) {
    return this.db.buyer.findUnique({ where: { walletAddress } });
  }

  upsertBuyer(input: WalletParty & Limits) {
    const { name, assetCode, assetScale } = input;
    return this.db.buyer.upsert({
      where: { walletAddress: input.walletAddress },
      create: input,
      update: { name, assetCode, assetScale },
    });
  }

  updateBuyerLimits(id: string, limits: Limits) {
    return this.db.buyer.update({ where: { id }, data: limits });
  }

  updateBuyerGrant(id: string, grant: GrantTokens) {
    return this.db.buyer.update({ where: { id }, data: grant });
  }

  createSale(input: NewSale) {
    return this.db.sale.create({ data: input });
  }

  getSale(id: string) {
    return this.db.sale.findUnique({ where: { id } });
  }

  updateSale(id: string, patch: SalePatch) {
    return this.db.sale.update({ where: { id }, data: patch });
  }

  async transitionSale(id: string, from: SaleStatus, patch: SalePatch) {
    const { count } = await this.db.sale.updateMany({ where: { id, status: from }, data: patch });
    return count === 1 ? this.getSale(id) : null;
  }

  async sumSpent(buyerId: string, range: DayRange) {
    const { _sum } = await this.db.sale.aggregate({
      _sum: { debitAmount: true },
      where: {
        buyerId,
        status: { in: ['CHARGING', 'PAID'] },
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    return _sum.debitAmount ?? 0n;
  }

  async listBuyerSales(buyerId: string, limit: number) {
    const rows = await this.db.sale.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { vendor: { select: { name: true } } },
    });
    return rows.map(({ vendor, ...sale }) => ({ ...sale, vendorName: vendor.name }));
  }
}
