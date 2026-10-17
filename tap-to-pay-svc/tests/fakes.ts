import type {
  BuyerRow,
  BuyerWalletRow,
  GrantTokens,
  Limits,
  NewSale,
  NewWallet,
  Repo,
  SalePatch,
  SaleRow,
  SaleWithBuyer,
  SaleWithVendor,
  VendorRow,
  VendorSaleQuery,
  VendorWalletRow,
  WalletAsset,
} from '../src/db/repos.js';
import type { DayRange } from '../src/services/limits.js';
import type { Amount } from '../src/services/money.js';
import type { Deps } from '../src/services/sales.js';
import type { OpenPayments, Quote, RotatedToken, WalletInfo } from '../src/open-payments/types.js';

/** Pinned so fixture sales always fall inside the same Bogotá day, whatever the real date. */
export const NOW = new Date('2026-10-14T15:00:00Z');

export const BUYER_WALLET = 'https://ilp.test/ana';
export const VENDOR_WALLET = 'https://ilp.test/tienda';

/** In-memory Repo. `transitionSale` checks status before any await, like the conditional SQL. */
export class FakeRepo implements Repo {
  buyers = new Map<string, BuyerRow>();
  wallets = new Map<string, BuyerWalletRow>();
  vendors = new Map<string, VendorRow>();
  vendorWallets = new Map<string, VendorWalletRow>();
  sales = new Map<string, SaleRow>();
  private seq = 0;

  constructor(private readonly now: () => Date = () => NOW) {}

  private id(prefix: string) {
    return `${prefix}${++this.seq}`;
  }

  /** A buyer with one wallet, its default; `wallet` overrides that wallet's fields. Returns both. */
  addBuyer({ wallet: walletFields, ...fields }: Partial<BuyerRow> & { wallet?: Partial<BuyerWalletRow> } = {}) {
    const buyer: BuyerRow = { id: this.id('b'), name: 'Ana', defaultWalletId: null, createdAt: this.now(), ...fields };
    this.buyers.set(buyer.id, buyer);
    const wallet = this.addBuyerWallet(buyer.id, walletFields);
    buyer.defaultWalletId = wallet.id;
    return { ...buyer, wallet };
  }

  /** Defaults to Ana's USD/2 wallet, granted, capped at 20.00 per payment and 50.00 per day. */
  addBuyerWallet(buyerId: string, overrides: Partial<BuyerWalletRow> = {}): BuyerWalletRow {
    const wallet: BuyerWalletRow = {
      id: this.id('w'),
      buyerId,
      walletAddress: BUYER_WALLET,
      publicName: null,
      assetCode: 'USD',
      assetScale: 2,
      perPaymentLimit: 2000n,
      dailyLimit: 5000n,
      grantAccessToken: 'token-1',
      grantManageUrl: 'https://auth.test/token/1',
      grantDailyLimit: null,
      createdAt: this.now(),
      ...overrides,
    };
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  /** A vendor with one receiving wallet, its default; `wallet` overrides that wallet's fields. Returns both. */
  addVendor({ wallet: walletFields, ...fields }: Partial<VendorRow> & { wallet?: Partial<VendorWalletRow> } = {}) {
    const vendor: VendorRow = { id: this.id('v'), name: 'Tienda', defaultWalletId: null, createdAt: this.now(), ...fields };
    this.vendors.set(vendor.id, vendor);
    const wallet = this.addVendorWallet(vendor.id, walletFields);
    vendor.defaultWalletId = wallet.id;
    return { ...vendor, wallet };
  }

  /** Defaults to the Tienda's USD/2 wallet. */
  addVendorWallet(vendorId: string, overrides: Partial<VendorWalletRow> = {}): VendorWalletRow {
    const wallet: VendorWalletRow = {
      id: this.id('vw'),
      vendorId,
      walletAddress: VENDOR_WALLET,
      publicName: null,
      assetCode: 'USD',
      assetScale: 2,
      createdAt: this.now(),
      ...overrides,
    };
    this.vendorWallets.set(wallet.id, wallet);
    return wallet;
  }

  /**
   * A sale receives into its vendor's default wallet. One with a buyer defaults to that buyer's default wallet, and
   * its debit to its own amount and asset, as a same-asset claim does.
   */
  addSale(overrides: Partial<SaleRow> & { vendorId: string }): SaleRow {
    const claimed = overrides.buyerId != null;
    const sale: SaleRow = {
      id: this.id('s'),
      vendorWalletId: this.vendors.get(overrides.vendorId)?.defaultWalletId ?? null,
      buyerId: null,
      buyerWalletId: claimed ? (this.buyers.get(overrides.buyerId!)?.defaultWalletId ?? null) : null,
      amount: 1000n,
      assetCode: 'USD',
      assetScale: 2,
      debitAmount: claimed ? (overrides.amount ?? 1000n) : null,
      debitAssetCode: claimed ? (overrides.assetCode ?? 'USD') : null,
      debitAssetScale: claimed ? (overrides.assetScale ?? 2) : null,
      status: 'AWAITING_TAP',
      incomingPaymentUrl: null,
      quoteId: null,
      outgoingPaymentUrl: null,
      failureCode: null,
      failureMessage: null,
      createdAt: this.now(),
      paidAt: null,
      ...overrides,
    };
    this.sales.set(sale.id, sale);
    return sale;
  }

  async listVendors() {
    return [...this.vendors.values()].sort((a, b) => a.name.localeCompare(b.name)).map((v) => this.vendorWithWallets(v));
  }
  async getVendor(id: string) {
    const vendor = this.vendors.get(id);
    return vendor ? this.vendorWithWallets(vendor) : null;
  }
  async getVendorWalletByAddress(walletAddress: string) {
    return [...this.vendorWallets.values()].find((w) => w.walletAddress === walletAddress) ?? null;
  }
  async upsertVendorWithWallet(name: string, input: WalletAsset) {
    const existing = await this.getVendorWalletByAddress(input.walletAddress);
    if (existing) {
      Object.assign(existing, { publicName: input.publicName, assetCode: input.assetCode, assetScale: input.assetScale });
      this.mustVendor(existing.vendorId).name = name;
      return this.vendorWithWallets(this.mustVendor(existing.vendorId));
    }
    const { id } = this.addVendor({ name, wallet: input });
    return this.vendorWithWallets(this.mustVendor(id));
  }
  async createVendorWallet(vendorId: string, input: WalletAsset) {
    return this.addVendorWallet(vendorId, input);
  }
  async setDefaultVendorWallet(vendorId: string, walletId: string) {
    this.mustVendor(vendorId).defaultWalletId = walletId;
  }
  async deleteVendorWallet(walletId: string) {
    if (!this.vendorWallets.delete(walletId)) throw new Error(`No vendor wallet ${walletId}`);
    for (const s of this.sales.values()) if (s.vendorWalletId === walletId) s.vendorWalletId = null;
  }
  async updateVendorWalletPublicName(walletId: string, publicName: string | null) {
    const wallet = this.vendorWallets.get(walletId);
    if (!wallet) throw new Error(`No vendor wallet ${walletId}`);
    wallet.publicName = publicName;
  }
  async listBuyers() {
    return [...this.buyers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((b) => this.buyerWithWallets(b));
  }
  async getBuyer(id: string) {
    const buyer = this.buyers.get(id);
    return buyer ? this.buyerWithWallets(buyer) : null;
  }
  async getWalletByAddress(walletAddress: string) {
    const wallet = [...this.wallets.values()].find((w) => w.walletAddress === walletAddress);
    return wallet ? { ...wallet, buyer: this.mustBuyer(wallet.buyerId) } : null;
  }
  async upsertBuyerWithWallet(name: string, input: NewWallet) {
    const existing = [...this.wallets.values()].find((w) => w.walletAddress === input.walletAddress);
    if (existing) {
      Object.assign(existing, { publicName: input.publicName, assetCode: input.assetCode, assetScale: input.assetScale });
      this.mustBuyer(existing.buyerId).name = name;
      return this.buyerWithWallets(this.mustBuyer(existing.buyerId));
    }
    const { id } = this.addBuyer({ name, wallet: { ...input, grantAccessToken: null, grantManageUrl: null } });
    return this.buyerWithWallets(this.mustBuyer(id));
  }
  async addWallet(buyerId: string, input: NewWallet) {
    return this.addBuyerWallet(buyerId, { ...input, grantAccessToken: null, grantManageUrl: null });
  }
  async setDefaultWallet(buyerId: string, walletId: string) {
    this.mustBuyer(buyerId).defaultWalletId = walletId;
  }
  async updateWalletLimits(walletId: string, limits: Limits) {
    return Object.assign(this.mustWallet(walletId), limits);
  }
  async updateWalletGrant(walletId: string, grant: GrantTokens) {
    return Object.assign(this.mustWallet(walletId), grant);
  }
  async updateWalletPublicName(walletId: string, publicName: string | null) {
    this.mustWallet(walletId).publicName = publicName;
  }
  async deleteWallet(walletId: string) {
    this.mustWallet(walletId);
    this.wallets.delete(walletId);
    for (const s of this.sales.values()) if (s.buyerWalletId === walletId) s.buyerWalletId = null;
  }
  async createSale(input: NewSale) {
    return this.addSale(input);
  }
  async getSale(id: string) {
    const sale = this.sales.get(id);
    return sale ? { ...sale } : null;
  }
  async updateSale(id: string, patch: SalePatch) {
    const sale = this.sales.get(id);
    if (!sale) throw new Error(`No sale ${id}`);
    Object.assign(sale, patch);
    return { ...sale };
  }
  transitionSale(id: string, from: SaleRow['status'], patch: SalePatch) {
    const sale = this.sales.get(id);
    if (!sale || sale.status !== from) return Promise.resolve(null);
    Object.assign(sale, patch);
    return Promise.resolve({ ...sale });
  }
  async sumSpent(walletId: string, range: DayRange) {
    let total = 0n;
    for (const s of this.sales.values()) {
      if (
        s.buyerWalletId === walletId &&
        (s.status === 'CHARGING' || s.status === 'PAID') &&
        s.createdAt >= range.start &&
        s.createdAt < range.end
      ) {
        total += s.debitAmount ?? 0n;
      }
    }
    return total;
  }
  async listBuyerSales(buyerId: string, limit: number, walletId?: string): Promise<SaleWithVendor[]> {
    return [...this.sales.values()]
      .filter((s) => s.buyerId === buyerId && (walletId === undefined || s.buyerWalletId === walletId))
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((s) => ({
        ...s,
        vendorName: this.vendors.get(s.vendorId)?.name ?? '?',
        vendorPublicName: s.vendorWalletId ? (this.vendorWallets.get(s.vendorWalletId)?.publicName ?? null) : null,
      }));
  }
  async listVendorSales(
    vendorId: string,
    { statuses, from, to, limit, walletId }: VendorSaleQuery,
  ): Promise<SaleWithBuyer[]> {
    return [...this.sales.values()]
      .filter(
        (s) =>
          s.vendorId === vendorId &&
          (walletId === undefined || s.vendorWalletId === walletId) &&
          statuses.includes(s.status) &&
          (!from || s.createdAt >= from) &&
          (!to || s.createdAt < to),
      )
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((s) => ({
        ...s,
        buyerName: s.buyerId ? (this.buyers.get(s.buyerId)?.name ?? null) : null,
        buyerPublicName: s.buyerWalletId ? (this.wallets.get(s.buyerWalletId)?.publicName ?? null) : null,
      }));
  }

  private buyerWithWallets(buyer: BuyerRow) {
    return { ...buyer, wallets: [...this.wallets.values()].filter((w) => w.buyerId === buyer.id) };
  }
  private vendorWithWallets(vendor: VendorRow) {
    return { ...vendor, wallets: [...this.vendorWallets.values()].filter((w) => w.vendorId === vendor.id) };
  }
  private mustVendor(id: string) {
    const vendor = this.vendors.get(id);
    if (!vendor) throw new Error(`No vendor ${id}`);
    return vendor;
  }
  private mustBuyer(id: string) {
    const buyer = this.buyers.get(id);
    if (!buyer) throw new Error(`No buyer ${id}`);
    return buyer;
  }
  private mustWallet(id: string) {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new Error(`No wallet ${id}`);
    return wallet;
  }
}

type Script = {
  /** Wallet documents by URL; unknown URLs get a USD/2 document derived from the URL. */
  wallets: Record<string, Partial<WalletInfo>>;
  /** receivedAmount per read, in order; an Error is thrown. Once empty, reads report the full amount. */
  received: Array<bigint | Error>;
  completed: boolean;
  /** What the quote debits, in the buyer wallet's asset. Default: the incoming amount (1:1). */
  quoteDebit?: bigint;
  /** Thrown by the next outgoing payment calls, in order. */
  outgoingFailures: Error[];
  rotateFails: boolean;
  /** Thrown by a step before the outgoing payment. */
  failOn: Partial<Record<'wallet' | 'incoming' | 'quote', Error>>;
};

/** Records every call as a string and is scripted per test. */
export class FakeOpenPayments implements OpenPayments {
  calls: string[] = [];
  script: Script = {
    wallets: {},
    received: [],
    completed: false,
    outgoingFailures: [],
    rotateFails: false,
    failOn: {},
  };
  private incomingAmounts = new Map<string, bigint>();
  private seq = 0;

  constructor(script: Partial<Script> = {}) {
    Object.assign(this.script, script);
  }

  async getWalletAddress(url: string): Promise<WalletInfo> {
    this.calls.push(`wallet:${url}`);
    if (this.script.failOn.wallet) throw this.script.failOn.wallet;
    return {
      id: url,
      publicName: null,
      authServer: `${url}/auth`,
      resourceServer: `${url}/rs`,
      assetCode: 'USD',
      assetScale: 2,
      ...this.script.wallets[url],
    };
  }

  async createIncomingPayment(vendor: WalletInfo, amount: Amount) {
    this.calls.push(`incoming:${amount.value}`);
    if (this.script.failOn.incoming) throw this.script.failOn.incoming;
    const url = `${vendor.resourceServer}/incoming-payments/${++this.seq}`;
    this.incomingAmounts.set(url, BigInt(amount.value));
    return url;
  }

  async createQuote(buyer: WalletInfo, receiverUrl: string): Promise<Quote> {
    this.calls.push(`quote:${receiverUrl}`);
    if (this.script.failOn.quote) throw this.script.failOn.quote;
    return {
      id: `quote-${++this.seq}`,
      debitAmount: this.script.quoteDebit ?? this.incomingAmounts.get(receiverUrl) ?? 0n,
      assetCode: buyer.assetCode,
      assetScale: buyer.assetScale,
    };
  }

  async createOutgoingPayment(buyer: WalletInfo, quoteId: string, accessToken: string) {
    this.calls.push(`outgoing:${quoteId}:${accessToken}`);
    const failure = this.script.outgoingFailures.shift();
    if (failure) throw failure;
    return `${buyer.resourceServer}/outgoing-payments/${++this.seq}`;
  }

  async rotateToken(_manageUrl: string, accessToken: string): Promise<RotatedToken> {
    this.calls.push(`rotate:${accessToken}`);
    if (this.script.rotateFails) throw new Error('rotation refused');
    return { value: `${accessToken}-rotated`, manage: 'https://auth.test/token/2' };
  }

  async getIncomingPayment(url: string) {
    this.calls.push(`get:${url}`);
    const next = this.script.received.shift();
    if (next instanceof Error) throw next;
    return {
      receivedAmount: next ?? this.incomingAmounts.get(url) ?? 0n,
      completed: this.script.completed,
    };
  }
}

export function makeDeps(overrides: Partial<Deps> = {}) {
  const repo = new FakeRepo();
  const op = new FakeOpenPayments();
  const deps: Deps = {
    repo,
    op,
    now: () => NOW,
    sleep: async () => {},
    timeZone: 'America/Bogota',
    pollSeconds: 8,
    defaultLimits: { perPaymentLimit: 2000n, dailyLimit: 5000n },
    ...overrides,
  };
  return { deps, repo, op };
}
