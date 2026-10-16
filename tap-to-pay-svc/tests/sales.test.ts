import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/services/errors.js';
import { WalletError } from '../src/open-payments/types.js';
import { chargeSale, createSale, refreshSale } from '../src/services/sales.js';
import { BUYER_WALLET, makeDeps, VENDOR_WALLET } from './fakes.js';

function setup(pollSeconds = 8) {
  const ctx = makeDeps({ pollSeconds });
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  return { ...ctx, buyer, vendor };
}

async function newSale(ctx: ReturnType<typeof setup>, amount = '1200') {
  return createSale(ctx.deps, ctx.vendor.id, amount);
}

describe('createSale', () => {
  it("creates in the vendor's asset", async () => {
    const ctx = setup();
    ctx.repo.vendors.get(ctx.vendor.id)!.assetCode = 'MXN';
    const sale = await newSale(ctx);
    expect(sale).toMatchObject({
      status: 'AWAITING_TAP',
      amount: '1200',
      amountFormatted: '12.00',
      assetCode: 'MXN',
      vendorName: 'Tienda',
      buyerId: null,
    });
  });

  it('rejects bad amounts and unknown vendors', async () => {
    const ctx = setup();
    await expect(newSale(ctx, '12.50')).rejects.toMatchObject({ status: 400, code: 'VALIDATION' });
    await expect(newSale(ctx, '0')).rejects.toMatchObject({ status: 400 });
    await expect(createSale(ctx.deps, 'nope', '100')).rejects.toMatchObject({
      status: 404,
      code: 'VENDOR_NOT_FOUND',
    });
  });
});

describe('chargeSale', () => {
  it('happy path: wallets in order, ends PAID with all three URLs stored', async () => {
    const ctx = setup();
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);

    expect(result.status).toBe('PAID');
    expect(result.paidAt).not.toBeNull();
    expect(result.buyerId).toBe(ctx.buyer.id);
    expect(ctx.op.calls).toEqual([
      `wallet:${VENDOR_WALLET}`,
      `wallet:${BUYER_WALLET}`,
      'incoming:1200',
      `quote:${VENDOR_WALLET}/rs/incoming-payments/1`,
      'outgoing:quote-2:token-1',
      `get:${VENDOR_WALLET}/rs/incoming-payments/1`,
    ]);
    const row = ctx.repo.sales.get(sale.id)!;
    expect(row.incomingPaymentUrl).toBeTruthy();
    expect(row.quoteId).toBeTruthy();
    expect(row.outgoingPaymentUrl).toBeTruthy();
  });

  it('never returns wallet URLs', async () => {
    const ctx = setup();
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(JSON.stringify(result)).not.toContain('incoming-payments');
  });

  describe('rule failures make no wallet call and never count toward the day', () => {
    const cases = [
      { name: 'unknown card', code: 'BUYER_UNKNOWN', amount: '1200', wallet: 'https://ilp.test/nobody', tweak: () => {} },
      {
        name: 'no grant',
        code: 'GRANT_MISSING',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) => (c.repo.buyers.get(c.buyer.id)!.grantAccessToken = null),
      },
      {
        name: 'asset mismatch',
        code: 'ASSET_MISMATCH',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) => (c.repo.buyers.get(c.buyer.id)!.assetCode = 'EUR'),
      },
      { name: 'per-payment cap', code: 'LIMIT_PER_PAYMENT', amount: '2500', wallet: BUYER_WALLET, tweak: () => {} },
      {
        name: 'daily cap',
        code: 'LIMIT_DAILY',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) =>
          c.repo.addSale({ vendorId: c.vendor.id, buyerId: c.buyer.id, status: 'PAID', amount: 4000n }),
      },
    ];

    it.each(cases)('$name → $code', async ({ code, amount, wallet, tweak }) => {
      const ctx = setup();
      tweak(ctx);
      const sale = await newSale(ctx, amount);
      const result = await chargeSale(ctx.deps, sale.id, wallet);
      expect(result).toMatchObject({ status: 'FAILED', failureCode: code, buyerId: null });
      expect(result.failureMessage).toBeTruthy();
      expect(ctx.op.calls).toEqual([]);
    });
  });

  it('CHARGING counts toward today, FAILED does not', async () => {
    const ctx = setup();
    const { id: vendorId } = ctx.vendor;
    const buyerId = ctx.buyer.id;
    ctx.repo.addSale({ vendorId, buyerId, status: 'CHARGING', amount: 2000n });
    ctx.repo.addSale({ vendorId, buyerId, status: 'FAILED', amount: 2000n });
    ctx.repo.addSale({ vendorId, buyerId, status: 'PAID', amount: 2000n });
    const sale = await newSale(ctx, '1001');
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result).toMatchObject({ failureCode: 'LIMIT_DAILY', failureMessage: "Over today's limit (10.00 left)" });
  });

  it("WALLET_ERROR keeps the wallet's message and releases the amount", async () => {
    const ctx = setup();
    ctx.op.script.failOn.quote = new WalletError('Insufficient liquidity', 400);
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: 'WALLET_ERROR',
      failureMessage: 'Insufficient liquidity',
    });
    expect(ctx.op.calls.some((c) => c.startsWith('outgoing'))).toBe(false);

    const range = { start: new Date(0), end: new Date('2100-01-01') };
    expect(await ctx.repo.sumSpent(ctx.buyer.id, range)).toBe(0n);
  });

  it('a 4xx on the outgoing payment fails the sale', async () => {
    const ctx = setup();
    ctx.op.script.outgoingFailures = [new WalletError('Bad quote', 400)];
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result).toMatchObject({ status: 'FAILED', failureCode: 'WALLET_ERROR', failureMessage: 'Bad quote' });
  });

  it.each([401, 403])('%i rotates the token once, persists it and retries', async (status) => {
    const ctx = setup();
    ctx.op.script.outgoingFailures = [new WalletError('Inactive Token', status)];
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result.status).toBe('PAID');
    expect(ctx.op.calls).toContain('rotate:token-1');
    expect(ctx.op.calls.filter((c) => c.startsWith('outgoing'))).toEqual([
      'outgoing:quote-2:token-1',
      'outgoing:quote-2:token-1-rotated',
    ]);
    expect(ctx.repo.buyers.get(ctx.buyer.id)).toMatchObject({
      grantAccessToken: 'token-1-rotated',
      grantManageUrl: 'https://auth.test/token/2',
    });
  });

  it('a failed rotation keeps the old token and fails the sale', async () => {
    const ctx = setup();
    ctx.op.script.outgoingFailures = [new WalletError('Inactive Token', 403)];
    ctx.op.script.rotateFails = true;
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result).toMatchObject({ status: 'FAILED', failureCode: 'WALLET_ERROR', failureMessage: 'rotation refused' });
    expect(ctx.repo.buyers.get(ctx.buyer.id)!.grantAccessToken).toBe('token-1');
  });

  it.each([
    ['a timeout', new Error('socket hang up')],
    ['a 503', new WalletError('Service Unavailable', 503)],
  ])('%s on the outgoing payment leaves the sale CHARGING and reserved', async (_name, failure) => {
    const ctx = setup();
    ctx.op.script.outgoingFailures = [failure];
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result.status).toBe('CHARGING');
    expect(ctx.repo.sales.get(sale.id)!.outgoingPaymentUrl).toBeNull();
    const range = { start: new Date(0), end: new Date('2100-01-01') };
    expect(await ctx.repo.sumSpent(ctx.buyer.id, range)).toBe(1200n);
  });

  it('slow completion reads exactly pollSeconds times, then refreshSale pays it', async () => {
    const ctx = setup(3);
    ctx.op.script.received = [0n, 0n, 600n];
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result.status).toBe('CHARGING');
    expect(ctx.op.calls.filter((c) => c.startsWith('get:'))).toHaveLength(3);

    const refreshed = await refreshSale(ctx.deps, sale.id);
    expect(refreshed.status).toBe('PAID');
  });

  it('a read error while polling leaves the sale CHARGING', async () => {
    const ctx = setup();
    ctx.op.script.received = [new WalletError('Wallet did not report a received amount')];
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result.status).toBe('CHARGING');
    expect(ctx.op.calls.filter((c) => c.startsWith('get:'))).toHaveLength(1);
  });

  it('a second charge is 409', async () => {
    const ctx = setup();
    const sale = await newSale(ctx);
    await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    await expect(chargeSale(ctx.deps, sale.id, BUYER_WALLET)).rejects.toMatchObject({
      status: 409,
      code: 'SALE_NOT_CHARGEABLE',
      message: 'Sale is PAID',
    });
  });

  it('two simultaneous charges create one outgoing payment; the loser gets 409', async () => {
    const ctx = setup();
    const sale = await newSale(ctx);
    const results = await Promise.allSettled([
      chargeSale(ctx.deps, sale.id, BUYER_WALLET),
      chargeSale(ctx.deps, sale.id, BUYER_WALLET),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(HttpError);
    expect(rejected[0].reason.message).toBe('Sale was already taken');
    expect(ctx.op.calls.filter((c) => c.startsWith('outgoing'))).toHaveLength(1);
  });

  it('an unknown sale is 404', async () => {
    const ctx = setup();
    await expect(chargeSale(ctx.deps, 'nope', BUYER_WALLET)).rejects.toMatchObject({
      status: 404,
      code: 'SALE_NOT_FOUND',
    });
  });
});
