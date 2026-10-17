import { createHash } from 'node:crypto';
import type { SaleStatus } from '../contracts.js';
import type { SaleWithBuyer, SaleWithVendor, VendorWalletRow } from '../db/repos.js';
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

/** One month of the payment-capacity table: what came in, what the vendor paid out in obligations, what was left. */
export type CapacityMonth = {
  month: string;
  income: bigint;
  sales: number;
  activeDays: number;
  /** Recurring payments the vendor paid that month, in this wallet's asset. */
  obligationsPaid: bigint;
  obligationsCount: number;
  /** Recurring payments refused or failed that month. */
  obligationsMissed: number;
  /** income - obligationsPaid. */
  net: bigint;
};

/** One of this month's recurring payments, as the statement lists it. */
export type Obligation = {
  date: Date;
  payee: string;
  /** The reference, from the sale's description. */
  reference: string | null;
  amount: bigint;
  assetCode: string;
  assetScale: number;
  status: SaleStatus;
};

/**
 * What a lender reads to judge whether the vendor can pay a loan month after month, over the 6-month window. Averages
 * run from the first month with income, so a new business is not averaged with months before it existed.
 */
export type Capacity = {
  months: CapacityMonth[];
  /** Months from the first one with income to this one. */
  historyMonths: number;
  averageIncome: bigint;
  minimumIncome: bigint;
  /** Coefficient of variation of the monthly income; lower is steadier. Null with fewer than two months. */
  variation: number | null;
  stability: 'high' | 'medium' | 'low' | null;
  /** Mean month-over-month change of the income, over months whose previous one had income. */
  averageGrowth: number | null;
  averageObligations: bigint;
  /** averageObligations / averageIncome. */
  obligationRatio: number | null;
  /** averageIncome - averageObligations: what is left each month, on average, to service a loan. */
  estimatedCapacity: bigint;
  /** Recurring payments over the window: paid, missed (refused or failed), and paid / (paid + missed). */
  punctuality: { paid: number; missed: number; rate: number | null };
};

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
  capacity: Capacity;
  /** This month's recurring payments made from this wallet, oldest first. */
  obligations: Obligation[];
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
  // What the vendor paid out: its recurring payments, made by its payer identity from the same wallet addresses.
  const payer = vendor.payerBuyerId ? await deps.repo.getBuyer(vendor.payerBuyerId) : null;
  const payerAddress = new Map((payer?.wallets ?? []).map((w) => [w.id, w.walletAddress]));
  const paidOut = payer
    ? (await deps.repo.listPayerSales(payer.id, { from: trendFrom, to })).filter(
        (s) => s.chargedVia === 'RECURRING' && (s.status === 'PAID' || s.status === 'FAILED'),
      )
    : [];

  const wallets = vendor.wallets
    .map((wallet) =>
      walletStatement(
        wallet,
        sales.filter((s) => s.vendorWalletId === wallet.id),
        paidOut.filter((s) => s.buyerWalletId !== null && payerAddress.get(s.buyerWalletId) === wallet.walletAddress),
        { year, month, from, to, tz },
      ),
    )
    // A wallet with nothing in six months adds an empty page; keep it only if it is the only one.
    .filter((w, _, all) => all.length === 1 || w.trend.some((m) => m.count > 0) || w.capacity.punctuality.paid > 0);

  const name = vendor.wallets.find((w) => w.id === vendor.defaultWalletId)?.publicName ?? vendor.name;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const fingerprint = JSON.stringify([
    vendorId,
    monthKey,
    wallets.map((w) => [
      w.walletAddress,
      w.paid.count,
      w.paid.total.toString(),
      w.failed.count,
      w.capacity.months.map((m) => [m.income.toString(), m.obligationsPaid.toString(), m.obligationsMissed]),
    ]),
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
  paidOut: SaleWithVendor[],
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
  const capacity = capacityOf(wallet, sales, paidOut, year, month, tz);
  const obligations: Obligation[] = paidOut
    .filter((s) => s.createdAt >= from && s.createdAt < to)
    .map((s) => {
      const [payee, reference] = (s.description ?? '').split(' · ');
      const debit = s.debitAmount !== null && s.debitAssetCode !== null;
      return {
        date: s.createdAt,
        payee: payee || (s.vendorPublicName ?? s.vendorName),
        reference: reference && reference !== 'pago recurrente' ? reference : null,
        amount: debit ? s.debitAmount! : s.amount,
        assetCode: debit ? s.debitAssetCode! : s.assetCode,
        assetScale: debit ? s.debitAssetScale! : s.assetScale,
        status: s.status,
      };
    });
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
    capacity,
    obligations,
    previousMonth: { count: previous.count, total: previous.total },
    growth: { total: change(total, previous.total), count: change(BigInt(paid.length), BigInt(previous.count)) },
    trend,
  };
}

function capacityOf(
  wallet: VendorWalletRow,
  sales: SaleWithBuyer[],
  paidOut: SaleWithVendor[],
  year: number,
  month: number,
  tz: string,
): Capacity {
  const months: CapacityMonth[] = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const start = localInstant(year, month - (TREND_MONTHS - 1) + i, 1, 0, tz);
    const end = localInstant(year, month - (TREND_MONTHS - 1) + i + 1, 1, 0, tz);
    const { year: y, month: m } = localDate(start, tz);
    const inMonth = <T extends { createdAt: Date }>(rows: T[]) => rows.filter((r) => r.createdAt >= start && r.createdAt < end);
    const paid = inMonth(sales).filter((s) => s.status === 'PAID');
    const out = inMonth(paidOut);
    // Obligations count in this wallet's asset: what left the wallet (the quote's debit), never the payee's price.
    const outPaid = out.filter((s) => s.status === 'PAID' && s.debitAssetCode === wallet.assetCode);
    const income = sum(paid.map((s) => s.amount));
    const obligationsPaid = sum(outPaid.map((s) => s.debitAmount ?? 0n));
    return {
      month: `${y}-${String(m).padStart(2, '0')}`,
      income,
      sales: paid.length,
      activeDays: new Set(paid.map((s) => localParts(s.createdAt, tz).day)).size,
      obligationsPaid,
      obligationsCount: out.filter((s) => s.status === 'PAID').length,
      obligationsMissed: out.filter((s) => s.status === 'FAILED').length,
      net: income - obligationsPaid,
    };
  });

  const first = months.findIndex((m) => m.income > 0n);
  const history = first === -1 ? [] : months.slice(first);
  const incomes = history.map((m) => m.income);
  const averageIncome = incomes.length ? sum(incomes) / BigInt(incomes.length) : 0n;
  const minimumIncome = incomes.length ? incomes.reduce((a, b) => (b < a ? b : a)) : 0n;
  let variation: number | null = null;
  if (incomes.length >= 2 && averageIncome > 0n) {
    const mean = Number(averageIncome);
    const sd = Math.sqrt(incomes.reduce((acc, v) => acc + (Number(v) - mean) ** 2, 0) / incomes.length);
    variation = sd / mean;
  }
  const changes = history
    .slice(1)
    .map((m, i) => (history[i].income > 0n ? Number(m.income - history[i].income) / Number(history[i].income) : null))
    .filter((c): c is number => c !== null);
  const averageObligations = history.length ? sum(history.map((m) => m.obligationsPaid)) / BigInt(history.length) : 0n;
  const paid = months.reduce((n, m) => n + m.obligationsCount, 0);
  const missed = months.reduce((n, m) => n + m.obligationsMissed, 0);
  return {
    months,
    historyMonths: history.length,
    averageIncome,
    minimumIncome,
    variation,
    stability: variation === null ? null : variation < 0.25 ? 'high' : variation < 0.5 ? 'medium' : 'low',
    averageGrowth: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
    averageObligations,
    obligationRatio: averageIncome > 0n ? Number(averageObligations) / Number(averageIncome) : null,
    estimatedCapacity: averageIncome - averageObligations,
    punctuality: { paid, missed, rate: paid + missed ? paid / (paid + missed) : null },
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
