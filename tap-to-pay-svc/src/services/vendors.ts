import type { SaleStatus, SummaryRange, VendorSaleView, VendorSummary, VendorView } from '../contracts.js';
import type { VendorWalletRow, VendorWithWallets } from '../db/repos.js';
import { toWalletError, type WalletInfo } from '../open-payments/types.js';
import { HttpError, validation } from './errors.js';
import { localDate, localInstant } from './limits.js';
import type { Deps } from './sales.js';
import { defaultWallet, saleView, vendorView } from './views.js';

type VendorDeps = Pick<Deps, 'repo' | 'now' | 'timeZone'>;
type WalletDeps = Pick<Deps, 'repo' | 'op'>;

const RANGE_DAYS: Record<SummaryRange, number> = { today: 1, week: 7, month: 30 };
const CLAIMED_OR_REFUSED: SaleStatus[] = ['PAID', 'CHARGING', 'FAILED'];

export async function listVendorViews(deps: Pick<Deps, 'repo'>): Promise<VendorView[]> {
  const vendors = await deps.repo.listVendors();
  // A vendor left without wallets has no view; skip it rather than fail the whole list (add:wallet repairs it). Billers
  // (EPM, Claro, …) receive recurring payments and never run a terminal, so they are not offered either.
  return vendors.filter((v) => v.wallets.length > 0 && v.kind !== 'BILLER').map(vendorView);
}

/**
 * The vendor dashboard from the service's ledger: the wallets hold the balances, this counts what it asked for.
 * One receiving wallet at a time, the default unless `walletId` names another, so totals never mix assets.
 */
export async function vendorSummary(
  deps: VendorDeps,
  vendorId: string,
  range: SummaryRange,
  walletId?: string,
): Promise<VendorSummary> {
  const vendor = await loadVendor(deps, vendorId);
  const wallet = walletId === undefined ? defaultWallet(vendor) : ownVendorWallet(vendor, walletId);
  const { year, month, day } = localDate(deps.now(), deps.timeZone);
  const days = RANGE_DAYS[range];
  // Bucket edges, oldest first, ending at the next local midnight.
  // shortcut: hourly buckets follow local wall-clock hours, so on a DST day one is empty or two hours long; Bogotá has no DST.
  const edges =
    range === 'today'
      ? Array.from({ length: 25 }, (_, hour) => localInstant(year, month, day, hour, deps.timeZone))
      : Array.from({ length: days + 1 }, (_, i) => localInstant(year, month, day - days + 1 + i, 0, deps.timeZone));
  const from = edges[0];
  const to = edges[edges.length - 1];

  const buckets = edges.slice(0, -1).map((start) => ({ start, count: 0, total: 0n }));
  const paid = { count: 0, total: 0n };
  const pending = { count: 0, total: 0n };
  let failed = 0;
  const sales = await deps.repo.listVendorSales(vendorId, { statuses: CLAIMED_OR_REFUSED, from, to, walletId: wallet.id });
  for (const sale of sales) {
    if (sale.status === 'PAID') {
      paid.count++;
      paid.total += sale.amount;
      let i = 0;
      while (i + 1 < buckets.length && sale.createdAt >= edges[i + 1]) i++;
      buckets[i].count++;
      buckets[i].total += sale.amount;
    } else if (sale.status === 'CHARGING') {
      pending.count++;
      pending.total += sale.amount;
    } else {
      failed++;
    }
  }

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
    paid: { count: paid.count, total: paid.total.toString() },
    pending: { count: pending.count, total: pending.total.toString() },
    failed: { count: failed },
    averageTicket: paid.count ? (paid.total / BigInt(paid.count)).toString() : '0',
    buckets: buckets.map((b) => ({ start: b.start.toISOString(), count: b.count, total: b.total.toString() })),
  };
}

/**
 * Newest first, every receiving wallet's unless `walletId` names one, each sale in its own asset. AWAITING_TAP is
 * left out unless asked for; `date` is a local calendar day (YYYY-MM-DD).
 */
export async function listVendorSales(
  deps: VendorDeps,
  vendorId: string,
  query: { status?: SaleStatus; date?: string; limit: number; walletId?: string; direction?: 'in' | 'out' | 'all' },
): Promise<VendorSaleView[]> {
  const vendor = await loadVendor(deps, vendorId);
  const wallet = query.walletId === undefined ? undefined : ownVendorWallet(vendor, query.walletId);
  const direction = query.direction ?? 'all';
  let day: { from: Date; to: Date } | undefined;
  if (query.date) {
    const [year, month, date] = query.date.split('-').map(Number);
    day = {
      from: localInstant(year, month, date, 0, deps.timeZone),
      to: localInstant(year, month, date + 1, 0, deps.timeZone),
    };
  }
  const statuses = query.status ? [query.status] : CLAIMED_OR_REFUSED;

  const incoming: VendorSaleView[] =
    direction === 'out'
      ? []
      : (
          await deps.repo.listVendorSales(vendorId, { statuses, ...day, limit: query.limit, walletId: query.walletId })
        ).map((sale) => ({
          ...saleView(sale, vendor.wallets.find((w) => w.id === sale.vendorWalletId)?.publicName ?? vendor.name),
          direction: 'IN',
          buyerName: sale.buyerPublicName ?? sale.buyerName,
          payeeName: null,
        }));

  // The recurring payments the vendor made from its own wallets (its payer identity, same addresses).
  let outgoing: VendorSaleView[] = [];
  if (direction !== 'in' && vendor.payerBuyerId) {
    const payer = await deps.repo.getBuyer(vendor.payerBuyerId);
    const address = new Map((payer?.wallets ?? []).map((w) => [w.id, w.walletAddress]));
    const paid = await deps.repo.listPayerSales(vendor.payerBuyerId, { ...day });
    outgoing = paid
      .filter((s) => s.chargedVia === 'RECURRING' && statuses.includes(s.status))
      .filter((s) => !wallet || (s.buyerWalletId !== null && address.get(s.buyerWalletId) === wallet.walletAddress))
      .map((sale) => {
        const payee = sale.vendorPublicName ?? sale.vendorName;
        return { ...saleView(sale, payee), direction: 'OUT', buyerName: null, payeeName: payee };
      });
  }

  return [...incoming, ...outgoing]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, query.limit);
}

/**
 * POST /vendors/:id/wallets and npm run add:wallet -- --vendor: one more receiving wallet for an existing vendor, its
 * asset read live from the wallet address document. A vendor's first wallet becomes the default one.
 */
export async function addVendorWallet(deps: WalletDeps, vendorId: string, walletAddress: string): Promise<VendorView> {
  if (!URL.canParse(walletAddress)) throw validation(`walletAddress must be a URL, got ${JSON.stringify(walletAddress)}`);
  const vendor = await loadVendor(deps, vendorId);
  if (await deps.repo.getVendorWalletByAddress(walletAddress)) {
    throw new HttpError(409, 'WALLET_TAKEN', `Wallet ${walletAddress} is already registered`);
  }
  let asset: WalletInfo;
  try {
    asset = await deps.op.getWalletAddress(walletAddress);
  } catch (err) {
    throw new HttpError(400, 'WALLET_UNREACHABLE', toWalletError(err).message);
  }
  // shortcut: as for buyers, two simultaneous adds of one address can make the loser a 500 instead of WALLET_TAKEN.
  const wallet = await deps.repo.createVendorWallet(vendorId, {
    walletAddress,
    publicName: asset.publicName,
    assetCode: asset.assetCode,
    assetScale: asset.assetScale,
  });
  if (vendor.wallets.length === 0) await deps.repo.setDefaultVendorWallet(vendorId, wallet.id);
  return vendorView(await loadVendor(deps, vendorId));
}

/** PUT /vendors/:id/default-wallet: the wallet new sales receive into. */
export async function setDefaultVendorWallet(
  deps: Pick<Deps, 'repo'>,
  vendorId: string,
  walletId: string,
): Promise<VendorView> {
  const vendor = await loadVendor(deps, vendorId);
  ownVendorWallet(vendor, walletId);
  await deps.repo.setDefaultVendorWallet(vendorId, walletId);
  return vendorView(await loadVendor(deps, vendorId));
}

/**
 * DELETE /vendors/:id/wallets/:walletId: never the last one; removing the default makes the oldest left the default.
 * Its sales keep the vendor; one still waiting for a tap fails with WALLET_ERROR when charged.
 */
export async function removeVendorWallet(
  deps: Pick<Deps, 'repo'>,
  vendorId: string,
  walletId: string,
): Promise<VendorView> {
  const vendor = await loadVendor(deps, vendorId);
  ownVendorWallet(vendor, walletId);
  if (vendor.wallets.length === 1) throw new HttpError(409, 'LAST_WALLET', 'A vendor keeps at least one wallet');
  // shortcut: as for buyers, two simultaneous removals can leave the vendor with no wallet.
  const wasDefault = defaultWallet(vendor).id === walletId;
  await deps.repo.deleteVendorWallet(walletId);
  if (wasDefault) await deps.repo.setDefaultVendorWallet(vendorId, vendor.wallets.find((w) => w.id !== walletId)!.id);
  return vendorView(await loadVendor(deps, vendorId));
}

/** add:wallet's --vendor: an id, an exact name or any of the vendor's wallet addresses. */
export function findVendor(vendors: VendorWithWallets[], key: string): VendorWithWallets {
  const vendor =
    vendors.find((v) => v.id === key) ??
    vendors.find((v) => v.name === key) ??
    vendors.find((v) => v.wallets.some((w) => w.walletAddress === key));
  if (!vendor) throw new Error(`Vendor "${key}" not found (match is exact: id, name or wallet address)`);
  return vendor;
}

export function ownVendorWallet(vendor: VendorWithWallets, walletId: string): VendorWalletRow {
  const wallet = vendor.wallets.find((w) => w.id === walletId);
  if (!wallet) throw new HttpError(404, 'WALLET_NOT_FOUND', `Wallet ${walletId} not found for vendor ${vendor.id}`);
  return wallet;
}

async function loadVendor(deps: Pick<Deps, 'repo'>, id: string): Promise<VendorWithWallets> {
  const vendor = await deps.repo.getVendor(id);
  if (!vendor) throw new HttpError(404, 'VENDOR_NOT_FOUND', `Vendor ${id} not found`);
  return vendor;
}
