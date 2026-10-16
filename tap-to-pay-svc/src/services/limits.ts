import type { SaleFailureCode } from '../contracts.js';
import type { BuyerRow } from '../db/repos.js';
import { formatAmount } from './money.js';

export type ChargeCheck = { ok: true } | { ok: false; code: SaleFailureCode; message: string };

/** The card is known and its buyer has authorized the service. Pure, no wallet call. */
export function checkBuyer(buyer: BuyerRow | null): ChargeCheck {
  if (!buyer) return { ok: false, code: 'BUYER_UNKNOWN', message: 'Card not registered' };
  if (!buyer.grantAccessToken || !buyer.grantManageUrl) {
    return {
      ok: false,
      code: 'GRANT_MISSING',
      message: "Buyer hasn't authorized this terminal (run npm run grant:buyer)",
    };
  }
  return { ok: true };
}

/**
 * Both caps, inclusive. `debit` is what the buyer pays in the buyer's own asset: the sale amount
 * when both wallets share an asset, else the quote's debitAmount.
 */
export function checkLimits(buyer: BuyerRow, debit: bigint, spentToday: bigint): ChargeCheck {
  if (debit > buyer.perPaymentLimit) {
    return {
      ok: false,
      code: 'LIMIT_PER_PAYMENT',
      message: `Over the per-payment limit (max ${formatAmount(buyer.perPaymentLimit, buyer.assetScale)} ${buyer.assetCode})`,
    };
  }
  if (spentToday + debit > buyer.dailyLimit) {
    const left = remainingToday(buyer.dailyLimit, spentToday);
    return {
      ok: false,
      code: 'LIMIT_DAILY',
      message: `Over today's limit (${formatAmount(left, buyer.assetScale)} ${buyer.assetCode} left)`,
    };
  }
  return { ok: true };
}

export function sameAsset(buyer: BuyerRow, sale: { assetCode: string; assetScale: number }): boolean {
  return buyer.assetCode === sale.assetCode && buyer.assetScale === sale.assetScale;
}

export function remainingToday(dailyLimit: bigint, spentToday: bigint): bigint {
  const left = dailyLimit - spentToday;
  return left > 0n ? left : 0n;
}

export type DayRange = { start: Date; end: Date };

/** UTC instants of local midnight today and the next local midnight in `timeZone`. */
export function dayRange(now: Date, timeZone: string): DayRange {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const [y, m, d] = [get('year'), get('month'), get('day')];
  return { start: localMidnight(y, m, d, timeZone), end: localMidnight(y, m, d + 1, timeZone) };
}

function localMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day);
  const first = wall - offsetMs(new Date(wall), timeZone);
  // One correction pass: the offset at the guess can differ from the offset at midnight on DST days.
  const second = wall - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

function offsetMs(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')!.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0; // "GMT"
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}
