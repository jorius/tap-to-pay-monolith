import { createHash } from 'node:crypto';
import type { SaleStatus } from '../contracts.js';
import type { SaleWithBuyer, VendorWalletRow } from '../db/repos.js';
import { HttpError, validation } from './errors.js';
import { localDate, localInstant } from './limits.js';
import type { Deps } from './sales.js';

// The vendor's monthly statement: what the service's ledger says about one calendar month of sales, worded for a
// lender. Balances live in the wallets; this is what was asked of them and what they answered. Each receiving wallet
// is its own section, so totals never mix assets.

type StatementDeps = Pick<Deps, 'repo' | 'now' | 'timeZone'>;

const TREND_MONTHS = 6;
const STATUSES: SaleStatus[] = ['PAID', 'CHARGING', 'FAILED'];

export type MonthTotals = { month: string; count: number; total: bigint };

export type WalletStatement = {
  walletAddress: string;
  publicName: string | null;
  assetCode: string;
  assetScale: number;
  paid: { count: number; total: bigint };
  pending: { count: number; total: bigint };
  failed: { count: number; byReason: { code: string; count: number }[] };
  /** paid / (paid + failed); null without any attempt. */
  approvalRate: number | null;
  averageTicket: bigint;
  medianTicket: bigint;
  largestSale: bigint;
  daysInMonth: number;
  activeDays: number;
  averagePerActiveDay: bigint;
  bestDay: { date: string; count: number; total: bigint } | null;
  /** Local hour (0 to 23) with the most paid sales. */
  peakHour: { hour: number; count: number } | null;
  uniqueBuyers: number;
  /** Buyers with two or more paid sales this month. */
  repeatBuyers: number;
  channels: { channel: string; count: number; total: bigint }[];
  /** Paid per local day of the month, 1 to daysInMonth. */
  daily: { day: number; count: number; total: bigint }[];
  previousMonth: { count: number; total: bigint };
  /** Change of the paid total and count against the previous month; null when that month had none. */
  growth: { total: number | null; count: number | null };
  /** Paid per month, oldest first, ending with this one. */
  trend: MonthTotals[];
};

export type Statement = {
  vendorId: string;
  vendorName: string;
  /** YYYY-MM */
  month: string;
  from: Date;
  to: Date;
  generatedAt: Date;
  timeZone: string;
  wallets: WalletStatement[];
  /** A short fingerprint of the figures, printed on the PDF so a copy can be checked against the service. */
  verificationCode: string;
};

/** YYYY-MM, or the current local month when left out; never a month that has not started. */
export function parseMonth(deps: Pick<Deps, 'now' | 'timeZone'>, input?: string): { year: number; month: number } {
  const today = localDate(deps.now(), deps.timeZone);
  if (!input) return { year: today.year, month: today.month };
  const match = /^(\d{4})-(\d{2})$/.exec(input);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw validation(`month must be YYYY-MM, got ${JSON.stringify(input)}`);
  const year = Number(match[1]);
  if (year * 12 + month > today.year * 12 + today.month) throw validation('month has not started yet');
  return { year, month };
}

export async function buildStatement(
  deps: StatementDeps,
  vendorId: string,
  { year, month }: { year: number; month: number },
): Promise<Statement> {
  const vendor = await deps.repo.getVendor(vendorId);
  if (!vendor) throw new HttpError(404, 'VENDOR_NOT_FOUND', `Vendor ${vendorId} not found`);
  const tz = deps.timeZone;
  const monthStart = (offset: number) => localInstant(year, month + offset, 1, 0, tz);
  const from = monthStart(0);
  const to = monthStart(1);
  const trendFrom = monthStart(1 - TREND_MONTHS);
  // Every claimed or refused sale of the vendor over the trend window, all wallets; split per wallet below.
  const sales = await deps.repo.listVendorSales(vendorId, { statuses: STATUSES, from: trendFrom, to });

  const wallets = vendor.wallets
    .map((wallet) =>
      walletStatement(
        wallet,
        sales.filter((s) => s.vendorWalletId === wallet.id),
        { year, month, from, to, tz },
      ),
    )
    // A wallet with nothing in six months adds an empty page; keep it only if it is the only one.
    .filter((w, _, all) => all.length === 1 || w.trend.some((m) => m.count > 0));

  const name = vendor.wallets.find((w) => w.id === vendor.defaultWalletId)?.publicName ?? vendor.name;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const fingerprint = JSON.stringify([
    vendorId,
    monthKey,
    wallets.map((w) => [w.walletAddress, w.paid.count, w.paid.total.toString(), w.failed.count]),
  ]);
  const code = createHash('sha256').update(fingerprint).digest('hex').slice(0, 12).toUpperCase();
  return {
    vendorId,
    vendorName: name,
    month: monthKey,
    from,
    to,
    generatedAt: deps.now(),
    timeZone: tz,
    wallets,
    verificationCode: code.match(/.{4}/g)!.join('-'),
  };
}

function walletStatement(
  wallet: VendorWalletRow,
  sales: SaleWithBuyer[],
  period: { year: number; month: number; from: Date; to: Date; tz: string },
): WalletStatement {
  const { year, month, from, to, tz } = period;
  const inMonth = sales.filter((s) => s.createdAt >= from && s.createdAt < to);
  const paid = inMonth.filter((s) => s.status === 'PAID');
  const failed = inMonth.filter((s) => s.status === 'FAILED');
  const pending = inMonth.filter((s) => s.status === 'CHARGING');
  const amounts = paid.map((s) => s.amount).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const total = sum(amounts);

  const daysInMonth = localDate(new Date(localInstant(year, month + 1, 1, 0, tz).getTime() - 1), tz).day;
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, count: 0, total: 0n }));
  const hours = new Array<number>(24).fill(0);
  const buyers = new Map<string, number>();
  const channels = new Map<string, { count: number; total: bigint }>();
  for (const sale of paid) {
    const local = localParts(sale.createdAt, tz);
    daily[local.day - 1].count++;
    daily[local.day - 1].total += sale.amount;
    hours[local.hour]++;
    const buyer = sale.buyerId ?? sale.buyerWalletId;
    if (buyer) buyers.set(buyer, (buyers.get(buyer) ?? 0) + 1);
    const channel = sale.chargedVia ?? 'NFC';
    const c = channels.get(channel) ?? { count: 0, total: 0n };
    c.count++;
    c.total += sale.amount;
    channels.set(channel, c);
  }
  const best = daily.reduce<(typeof daily)[number] | null>((b, d) => (d.total > (b?.total ?? 0n) ? d : b), null);
  const peak = hours.reduce<{ hour: number; count: number } | null>(
    (p, count, hour) => (count > (p?.count ?? 0) ? { hour, count } : p),
    null,
  );
  const activeDays = daily.filter((d) => d.count > 0).length;
  const reasons = new Map<string, number>();
  for (const sale of failed) reasons.set(sale.failureCode ?? 'UNKNOWN', (reasons.get(sale.failureCode ?? 'UNKNOWN') ?? 0) + 1);

  const trend: MonthTotals[] = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const start = localInstant(year, month - (TREND_MONTHS - 1) + i, 1, 0, tz);
    const end = localInstant(year, month - (TREND_MONTHS - 1) + i + 1, 1, 0, tz);
    const { year: y, month: m } = localDate(start, tz);
    const monthPaid = sales.filter((s) => s.status === 'PAID' && s.createdAt >= start && s.createdAt < end);
    return { month: `${y}-${String(m).padStart(2, '0')}`, count: monthPaid.length, total: sum(monthPaid.map((s) => s.amount)) };
  });
  const previous = trend[trend.length - 2];
  const change = (now: bigint, before: bigint) => (before > 0n ? Number(now - before) / Number(before) : null);

  return {
    walletAddress: wallet.walletAddress,
    publicName: wallet.publicName,
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
    paid: { count: paid.length, total },
    pending: { count: pending.length, total: sum(pending.map((s) => s.amount)) },
    failed: {
      count: failed.length,
      byReason: [...reasons].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    },
    approvalRate: paid.length + failed.length ? paid.length / (paid.length + failed.length) : null,
    averageTicket: paid.length ? total / BigInt(paid.length) : 0n,
    medianTicket: median(amounts),
    largestSale: amounts.at(-1) ?? 0n,
    daysInMonth,
    activeDays,
    averagePerActiveDay: activeDays ? total / BigInt(activeDays) : 0n,
    bestDay: best && best.count > 0 ? { date: isoDay(year, month, best.day), count: best.count, total: best.total } : null,
    peakHour: peak,
    uniqueBuyers: buyers.size,
    repeatBuyers: [...buyers.values()].filter((n) => n >= 2).length,
    channels: [...channels]
      .map(([channel, c]) => ({ channel, ...c }))
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    daily,
    previousMonth: { count: previous.count, total: previous.total },
    growth: { total: change(total, previous.total), count: change(BigInt(paid.length), BigInt(previous.count)) },
    trend,
  };
}

function localParts(at: Date, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { day: get('day'), hour: get('hour') % 24 };
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

function median(sorted: bigint[]): bigint {
  if (sorted.length === 0) return 0n;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

const isoDay = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
