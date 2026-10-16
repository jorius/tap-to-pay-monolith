import type {
  BuyerRow,
  GrantTokens,
  Limits,
  NewSale,
  Repo,
  SalePatch,
  SaleRow,
  SaleWithVendor,
  VendorRow,
  WalletParty,
} from '../src/db/repos.js';
import type { DayRange } from '../src/services/limits.js';
import type { Amount } from '../src/services/money.js';
import type { Deps } from '../src/services/sales.js';
import type { OpenPayments, RotatedToken, WalletInfo } from '../src/open-payments/types.js';

/** Pinned so fixture sales always fall inside the same Bogotá day, whatever the real date. */
export const NOW = new Date('2026-10-14T15:00:00Z');

export const BUYER_WALLET = 'https://ilp.test/ana';
export const VENDOR_WALLET = 'https://ilp.test/tienda';

/** In-memory Repo. `transitionSale` checks status before any await, like the conditional SQL. */
export class FakeRepo implements Repo {
  buyers = new Map<string, BuyerRow>();
  vendors = new Map<string, VendorRow>();
  sales = new Map<string, SaleRow>();
  private seq = 0;

  constructor(private readonly now: () => Date = () => NOW) {}

  private id(prefix: string) {
    return `${prefix}${++this.seq}`;
  }

  addBuyer(overrides: Partial<BuyerRow> = {}): BuyerRow {
    const buyer: BuyerRow = {
      id: this.id('b'),
      name: 'Ana',
      walletAddress: BUYER_WALLET,
      assetCode: 'USD',
      assetScale: 2,
      perPaymentLimit: 2000n,
      dailyLimit: 5000n,
      grantAccessToken: 'token-1',
      grantManageUrl: 'https://auth.test/token/1',
      createdAt: this.now(),
      ...overrides,
    };
    this.buyers.set(buyer.id, buyer);
    return buyer;
  }

  addVendor(overrides: Partial<VendorRow> = {}): VendorRow {
    const vendor: VendorRow = {
      id: this.id('v'),
      name: 'Tienda',
      walletAddress: VENDOR_WALLET,
      assetCode: 'USD',
      assetScale: 2,
      createdAt: this.now(),
      ...overrides,
    };
    this.vendors.set(vendor.id, vendor);
    return vendor;
  }

  addSale(overrides: Partial<SaleRow> & { vendorId: string }): SaleRow {
    const sale: SaleRow = {
      id: this.id('s'),
      buyerId: null,
      amount: 1000n,
      assetCode: 'USD',
      assetScale: 2,
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
    return [...this.vendors.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async getVendor(id: string) {
    return this.vendors.get(id) ?? null;
  }
  async upsertVendor(input: WalletParty) {
    const existing = [...this.vendors.values()].find((v) => v.walletAddress === input.walletAddress);
    if (existing) return Object.assign(existing, input);
    return this.addVendor(input);
  }
  async listBuyers() {
    return [...this.buyers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async getBuyer(id: string) {
    return this.buyers.get(id) ?? null;
  }
  async getBuyerByWallet(walletAddress: string) {
    return [...this.buyers.values()].find((b) => b.walletAddress === walletAddress) ?? null;
  }
  async upsertBuyer(input: WalletParty & Limits) {
    const existing = await this.getBuyerByWallet(input.walletAddress);
    if (!existing) return this.addBuyer(input);
    const { name, assetCode, assetScale } = input;
    return Object.assign(existing, { name, assetCode, assetScale });
  }
  async updateBuyerLimits(id: string, limits: Limits) {
    return Object.assign(this.mustBuyer(id), limits);
  }
  async updateBuyerGrant(id: string, grant: GrantTokens) {
    return Object.assign(this.mustBuyer(id), grant);
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
  async sumSpent(buyerId: string, range: DayRange) {
    let total = 0n;
    for (const s of this.sales.values()) {
      if (
        s.buyerId === buyerId &&
        (s.status === 'CHARGING' || s.status === 'PAID') &&
        s.createdAt >= range.start &&
        s.createdAt < range.end
      ) {
        total += s.amount;
      }
    }
    return total;
  }
  async listBuyerSales(buyerId: string, limit: number): Promise<SaleWithVendor[]> {
    return [...this.sales.values()]
      .filter((s) => s.buyerId === buyerId)
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((s) => ({ ...s, vendorName: this.vendors.get(s.vendorId)?.name ?? '?' }));
  }

  private mustBuyer(id: string) {
    const buyer = this.buyers.get(id);
    if (!buyer) throw new Error(`No buyer ${id}`);
    return buyer;
  }
}

type Script = {
  /** Wallet documents by URL; unknown URLs get a USD/2 document derived from the URL. */
  wallets: Record<string, Partial<WalletInfo>>;
  /** receivedAmount per read, in order; an Error is thrown. Once empty, reads report the full amount. */
  received: Array<bigint | Error>;
  completed: boolean;
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

  async createQuote(_buyer: WalletInfo, receiverUrl: string) {
    this.calls.push(`quote:${receiverUrl}`);
    if (this.script.failOn.quote) throw this.script.failOn.quote;
    return `quote-${++this.seq}`;
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
    ...overrides,
  };
  return { deps, repo, op };
}
