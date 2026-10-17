import type { SaleFailureCode } from '../contracts.js';
import type { BuyerWalletRow } from '../db/repos.js';
import { formatAmount } from './money.js';

export type ChargeCheck = { ok: true } | { ok: false; code: SaleFailureCode; message: string };

/** The card is a registered wallet and that wallet's grant is stored. Pure, no wallet call. */
export function checkWallet(wallet: BuyerWalletRow | null): ChargeCheck {
  if (!wallet) return { ok: false, code: 'BUYER_UNKNOWN', message: 'Card not registered' };
  if (!wallet.grantAccessToken || !wallet.grantManageUrl) {
    return {
      ok: false,
      code: 'GRANT_MISSING',
      message: "Buyer hasn't authorized this terminal (run npm run grant:buyer)",
    };
  }
  return { ok: true };
}

/**
 * The paying wallet's caps, inclusive, then its grant. `debit` is what that wallet pays in its own asset: the sale
 * amount when both wallets share an asset, else the quote's debitAmount. `spentToday` is that wallet's.
 */
export function checkLimits(wallet: BuyerWalletRow, debit: bigint, spentToday: bigint): ChargeCheck {
  if (debit > wallet.perPaymentLimit) {
    return {
      ok: false,
      code: 'LIMIT_PER_PAYMENT',
      message: `Over the per-payment limit (max ${formatAmount(wallet.perPaymentLimit, wallet.assetScale)} ${wallet.assetCode})`,
    };
  }
  if (spentToday + debit > wallet.dailyLimit) {
    const left = remainingToday(wallet.dailyLimit, spentToday);
    return {
      ok: false,
      code: 'LIMIT_DAILY',
      message: `Over today's limit (${formatAmount(left, wallet.assetScale)} ${wallet.assetCode} left)`,
    };
  }
  // The wallet itself refuses past the grant's debitAmount, so refuse first with a clear reason. A grant without
  // limits (grantDailyLimit null) is not checked here.
  if (wallet.grantDailyLimit != null && spentToday + debit > wallet.grantDailyLimit) {
    const left = remainingToday(wallet.grantDailyLimit, spentToday);
    return {
      ok: false,
      code: 'GRANT_LIMIT',
      message: `Over what your wallet authorized today (${formatAmount(left, wallet.assetScale)} ${wallet.assetCode} left)`,
    };
  }
  return { ok: true };
}

type Asset = { assetCode: string; assetScale: number };

export function sameAsset(a: Asset, b: Asset): boolean {
  return a.assetCode === b.assetCode && a.assetScale === b.assetScale;
}

export function remainingToday(dailyLimit: bigint, spentToday: bigint): bigint {
  const left = dailyLimit - spentToday;
  return left > 0n ? left : 0n;
}

export type DayRange = { start: Date; end: Date };

/** UTC instants of local midnight today and the next local midnight in `timeZone`. */
export function dayRange(now: Date, timeZone: string): DayRange {
  const { year, month, day } = localDate(now, timeZone);
  return { start: localInstant(year, month, day, 0, timeZone), end: localInstant(year, month, day + 1, 0, timeZone) };
}

/** The calendar date `now` falls on in `timeZone`; month is 1 to 12. */
export function localDate(now: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** The UTC instant of a local wall-clock hour in `timeZone`; day and hour may overflow, Date.UTC rolls them over. */
export function localInstant(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = wall - offsetMs(new Date(wall), timeZone);
  // One correction pass: the offset at the guess can differ from the offset at that hour on DST days.
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
