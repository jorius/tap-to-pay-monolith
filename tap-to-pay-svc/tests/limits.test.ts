import { describe, expect, it } from 'vitest';
import type { BuyerWalletRow } from '../src/db/repos.js';
import { checkLimits, checkWallet, dayRange, remainingToday, sameAsset } from '../src/services/limits.js';

const wallet: BuyerWalletRow = {
  id: 'w1',
  buyerId: 'b1',
  walletAddress: 'https://ilp.test/ana',
  publicName: null,
  assetCode: 'USD',
  assetScale: 2,
  perPaymentLimit: 2000n,
  dailyLimit: 5000n,
  grantAccessToken: 't',
  grantManageUrl: 'https://auth.test/token',
  grantDailyLimit: null,
  createdAt: new Date(),
};

describe('checkWallet', () => {
  it('passes a known wallet with a grant', () => {
    expect(checkWallet(wallet)).toEqual({ ok: true });
  });

  it('refuses an unknown card', () => {
    expect(checkWallet(null)).toMatchObject({ code: 'BUYER_UNKNOWN', message: 'Card not registered' });
  });

  it('refuses without a token or a manage URL', () => {
    const expected = {
      code: 'GRANT_MISSING',
      message: "Buyer hasn't authorized this terminal (run npm run grant:buyer)",
    };
    expect(checkWallet({ ...wallet, grantAccessToken: null })).toMatchObject(expected);
    expect(checkWallet({ ...wallet, grantManageUrl: null })).toMatchObject(expected);
  });
});

describe('checkLimits', () => {
  it('allows within and exactly at both caps', () => {
    expect(checkLimits(wallet, 1200n, 0n)).toEqual({ ok: true });
    expect(checkLimits(wallet, 2000n, 3000n)).toEqual({ ok: true });
  });

  it("refuses over the per-payment cap, in the wallet's asset", () => {
    expect(checkLimits(wallet, 2001n, 0n)).toMatchObject({
      code: 'LIMIT_PER_PAYMENT',
      message: 'Over the per-payment limit (max 20.00 USD)',
    });
  });

  it('refuses over the daily cap', () => {
    expect(checkLimits(wallet, 1200n, 4000n)).toMatchObject({
      code: 'LIMIT_DAILY',
      message: "Over today's limit (10.00 USD left)",
    });
  });

  it('checks the per-payment cap before the daily cap', () => {
    expect(checkLimits(wallet, 2500n, 5000n)).toMatchObject({ code: 'LIMIT_PER_PAYMENT' });
  });

  it("refuses past what the wallet's grant authorized today, inclusive", () => {
    const granted = { ...wallet, grantDailyLimit: 3000n };
    expect(checkLimits(granted, 1000n, 2000n)).toEqual({ ok: true });
    expect(checkLimits(granted, 1200n, 2000n)).toMatchObject({
      code: 'GRANT_LIMIT',
      message: 'Over what your wallet authorized today (10.00 USD left)',
    });
  });

  it('checks the grant after both caps, and skips it for a grant without limits', () => {
    expect(checkLimits({ ...wallet, grantDailyLimit: 1000n }, 1200n, 4000n)).toMatchObject({ code: 'LIMIT_DAILY' });
    expect(checkLimits(wallet, 1200n, 3000n)).toEqual({ ok: true });
  });
});

describe('sameAsset', () => {
  it('compares code and scale', () => {
    expect(sameAsset(wallet, { assetCode: 'USD', assetScale: 2 })).toBe(true);
    expect(sameAsset(wallet, { assetCode: 'EUR', assetScale: 2 })).toBe(false);
    expect(sameAsset(wallet, { assetCode: 'USD', assetScale: 9 })).toBe(false);
  });
});

describe('remainingToday', () => {
  it('floors at zero', () => {
    expect(remainingToday(5000n, 1200n)).toBe(3800n);
    expect(remainingToday(5000n, 6000n)).toBe(0n);
  });
});

describe('dayRange', () => {
  const iso = (r: { start: Date; end: Date }) => [r.start.toISOString(), r.end.toISOString()];

  it('Bogotá: 23:59 and 00:01 fall on different days', () => {
    expect(iso(dayRange(new Date('2026-10-15T04:59:00Z'), 'America/Bogota'))).toEqual([
      '2026-10-14T05:00:00.000Z',
      '2026-10-15T05:00:00.000Z',
    ]);
    expect(iso(dayRange(new Date('2026-10-15T05:01:00Z'), 'America/Bogota'))).toEqual([
      '2026-10-15T05:00:00.000Z',
      '2026-10-16T05:00:00.000Z',
    ]);
  });

  it('UTC', () => {
    expect(iso(dayRange(new Date('2026-10-14T15:00:00Z'), 'UTC'))).toEqual([
      '2026-10-14T00:00:00.000Z',
      '2026-10-15T00:00:00.000Z',
    ]);
  });

  it('New York fall-back day lasts 25 hours', () => {
    expect(iso(dayRange(new Date('2026-11-01T15:00:00Z'), 'America/New_York'))).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
  });

  it('New York spring-forward day lasts 23 hours', () => {
    expect(iso(dayRange(new Date('2026-03-08T15:00:00Z'), 'America/New_York'))).toEqual([
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ]);
  });

  it('Asia/Kolkata half-hour offset', () => {
    expect(iso(dayRange(new Date('2026-10-14T15:00:00Z'), 'Asia/Kolkata'))).toEqual([
      '2026-10-13T18:30:00.000Z',
      '2026-10-14T18:30:00.000Z',
    ]);
  });
});
