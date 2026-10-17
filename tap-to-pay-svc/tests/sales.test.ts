import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/services/errors.js';
import { WalletError } from '../src/open-payments/types.js';
import { getBuyer } from '../src/services/buyers.js';
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
  it("creates in the asset of the vendor's default wallet", async () => {
    const ctx = setup();
    ctx.repo.vendorWallets.get(ctx.vendor.wallet.id)!.assetCode = 'MXN';
    const sale = await newSale(ctx);
    expect(sale).toMatchObject({
      status: 'AWAITING_TAP',
      amount: '1200',
      amountFormatted: '12.00',
      assetCode: 'MXN',
      vendorName: 'Tienda',
      vendorWalletId: ctx.vendor.wallet.id,
      buyerId: null,
    });
  });

  it("receives into the wallet it names, in that wallet's asset; another vendor's wallet is WALLET_NOT_FOUND", async () => {
    const ctx = setup();
    const eur = ctx.repo.addVendorWallet(ctx.vendor.id, { walletAddress: 'https://ilp.test/tienda-eur', assetCode: 'EUR' });
    expect(await createSale(ctx.deps, ctx.vendor.id, '1200', eur.id)).toMatchObject({
      vendorWalletId: eur.id,
      assetCode: 'EUR',
    });
    const other = ctx.repo.addVendor({ name: 'Otra', wallet: { walletAddress: 'https://ilp.test/otra' } });
    await expect(createSale(ctx.deps, ctx.vendor.id, '1200', other.wallet.id)).rejects.toMatchObject({
      status: 404,
      code: 'WALLET_NOT_FOUND',
      message: `Wallet ${other.wallet.id} not found for vendor ${ctx.vendor.id}`,
    });
  });

  it("names the vendor after the receiving wallet's public name", async () => {
    const ctx = setup();
    ctx.repo.vendorWallets.get(ctx.vendor.wallet.id)!.publicName = 'Tienda La 14';
    expect((await newSale(ctx)).vendorName).toBe('Tienda La 14');
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
    expect(result.buyerWalletId).toBe(ctx.buyer.wallet.id);
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
      {
        name: 'unknown card',
        code: 'BUYER_UNKNOWN',
        amount: '1200',
        wallet: 'https://ilp.test/nobody',
        tweak: () => {},
        known: false,
      },
      {
        name: 'no grant',
        code: 'GRANT_MISSING',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) => (c.repo.wallets.get(c.buyer.wallet.id)!.grantAccessToken = null),
        known: true,
      },
      {
        name: 'per-payment cap',
        code: 'LIMIT_PER_PAYMENT',
        amount: '2500',
        wallet: BUYER_WALLET,
        tweak: () => {},
        known: true,
      },
      {
        name: 'daily cap',
        code: 'LIMIT_DAILY',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) =>
          c.repo.addSale({ vendorId: c.vendor.id, buyerId: c.buyer.id, status: 'PAID', amount: 4000n }),
        known: true,
      },
      {
        name: 'grant daily limit',
        code: 'GRANT_LIMIT',
        amount: '1200',
        wallet: BUYER_WALLET,
        tweak: (c: ReturnType<typeof setup>) => (c.repo.wallets.get(c.buyer.wallet.id)!.grantDailyLimit = 1000n),
        known: true,
      },
    ];

    it.each(cases)('$name → $code', async ({ code, amount, wallet, tweak, known }) => {
      const ctx = setup();
      tweak(ctx);
      const before = await getBuyer(ctx.deps, ctx.buyer.id);
      const sale = await newSale(ctx, amount);
      const result = await chargeSale(ctx.deps, sale.id, wallet);
      // A known payer is recorded so the refusal reaches their history; an unknown card has no wallet to point at.
      expect(result).toMatchObject({
        status: 'FAILED',
        failureCode: code,
        buyerId: known ? ctx.buyer.id : null,
        buyerWalletId: known ? ctx.buyer.wallet.id : null,
        debitAmount: null,
      });
      expect(result.failureMessage).toBeTruthy();
      expect(ctx.op.calls).toEqual([]);
      // Nothing reserved: spent today, what is left and what the grant has left are as they were.
      expect(await getBuyer(ctx.deps, ctx.buyer.id)).toEqual(before);
    });
  });

  it('a refusal reserves nothing: the next sale that fits the day is charged', async () => {
    const ctx = setup();
    ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 4000n });
    const over = await chargeSale(ctx.deps, (await newSale(ctx, '1200')).id, BUYER_WALLET);
    expect(over).toMatchObject({ status: 'FAILED', failureCode: 'LIMIT_DAILY', buyerWalletId: ctx.buyer.wallet.id });
    const fits = await chargeSale(ctx.deps, (await newSale(ctx, '1000')).id, BUYER_WALLET);
    expect(fits).toMatchObject({ status: 'PAID', buyerWalletId: ctx.buyer.wallet.id });
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
    expect(result).toMatchObject({ failureCode: 'LIMIT_DAILY', failureMessage: "Over today's limit (10.00 USD left)" });
  });

  it('a same-asset sale records its own amount as the debit', async () => {
    const ctx = setup();
    const sale = await newSale(ctx);
    const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    expect(result).toMatchObject({ debitAmount: '1200', debitAmountFormatted: '12.00', debitAssetCode: 'USD' });
  });

  describe('a vendor in another asset', () => {
    function crossSetup(quoteDebit: bigint) {
      const ctx = setup();
      ctx.repo.vendorWallets.get(ctx.vendor.wallet.id)!.assetCode = 'EUR';
      ctx.op.script.wallets[VENDOR_WALLET] = { assetCode: 'EUR' };
      ctx.op.script.quoteDebit = quoteDebit;
      return ctx;
    }

    it("is charged, and the buyer's debit is what the quote says", async () => {
      const ctx = crossSetup(1300n); // 12.00 EUR costs the buyer 13.00 USD
      const sale = await newSale(ctx);
      expect(sale.assetCode).toBe('EUR');
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({
        status: 'PAID',
        amount: '1200',
        assetCode: 'EUR',
        debitAmount: '1300',
        debitAmountFormatted: '13.00',
        debitAssetCode: 'USD',
      });
      const range = { start: new Date(0), end: new Date('2100-01-01') };
      expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(1300n);
    });

    it('checks the per-payment cap against the debit, before the outgoing payment', async () => {
      const ctx = crossSetup(2100n); // 18.00 EUR costs 21.00 USD, over the 20.00 USD cap
      const sale = await newSale(ctx, '1800');
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({
        status: 'FAILED',
        failureCode: 'LIMIT_PER_PAYMENT',
        failureMessage: 'Over the per-payment limit (max 20.00 USD)',
      });
      expect(ctx.op.calls.some((c) => c.startsWith('outgoing'))).toBe(false);
      const range = { start: new Date(0), end: new Date('2100-01-01') };
      expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(0n);
    });

    it('checks the daily cap against the debit', async () => {
      const ctx = crossSetup(1500n);
      ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 4000n });
      const sale = await newSale(ctx, '1000');
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({ status: 'FAILED', failureCode: 'LIMIT_DAILY' });
      expect(ctx.op.calls.some((c) => c.startsWith('outgoing'))).toBe(false);
    });

    it("checks the wallet's grant limit against the debit, before the outgoing payment", async () => {
      const ctx = crossSetup(1500n); // 10.00 EUR costs 15.00 USD; the grant allows 10.00 USD a day
      ctx.repo.wallets.get(ctx.buyer.wallet.id)!.grantDailyLimit = 1000n;
      const sale = await newSale(ctx, '1000');
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({
        status: 'FAILED',
        failureCode: 'GRANT_LIMIT',
        failureMessage: 'Over what your wallet authorized today (10.00 USD left)',
      });
      expect(ctx.op.calls.some((c) => c.startsWith('outgoing'))).toBe(false);
    });
  });

  describe('a buyer with a second wallet', () => {
    const SECOND_WALLET = 'https://ilp.test/ana-ahorros';
    function twoWallets() {
      const ctx = setup();
      const second = ctx.repo.addBuyerWallet(ctx.buyer.id, {
        walletAddress: SECOND_WALLET,
        perPaymentLimit: 1500n,
        dailyLimit: 3000n,
        grantAccessToken: 'token-2',
        grantManageUrl: 'https://auth.test/token/second',
      });
      return { ...ctx, second };
    }

    it('pays with that wallet: its token, its claim, its own day', async () => {
      const ctx = twoWallets();
      // The default wallet already spent 40.00 of its 50.00 today; the second wallet's day is untouched.
      ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 4000n });
      const sale = await newSale(ctx);
      const result = await chargeSale(ctx.deps, sale.id, SECOND_WALLET);
      expect(result).toMatchObject({ status: 'PAID', buyerId: ctx.buyer.id, buyerWalletId: ctx.second.id });
      expect(ctx.op.calls).toContain(`wallet:${SECOND_WALLET}`);
      expect(ctx.op.calls).toContain('outgoing:quote-2:token-2');
      const range = { start: new Date(0), end: new Date('2100-01-01') };
      expect(await ctx.repo.sumSpent(ctx.second.id, range)).toBe(1200n);
      expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(4000n);
    });

    it("refuses on that wallet's caps and grant, not the default's", async () => {
      const ctx = twoWallets();
      const overCap = await newSale(ctx, '1600'); // within the default's 20.00, over the second's 15.00
      expect(await chargeSale(ctx.deps, overCap.id, SECOND_WALLET)).toMatchObject({
        failureCode: 'LIMIT_PER_PAYMENT',
        failureMessage: 'Over the per-payment limit (max 15.00 USD)',
      });
      ctx.repo.wallets.get(ctx.second.id)!.grantAccessToken = null;
      const sale = await newSale(ctx);
      expect(await chargeSale(ctx.deps, sale.id, SECOND_WALLET)).toMatchObject({ failureCode: 'GRANT_MISSING' });
      expect(ctx.op.calls).toEqual([]);
    });

    it("a rotation updates that wallet's tokens only", async () => {
      const ctx = twoWallets();
      ctx.op.script.outgoingFailures = [new WalletError('Inactive Token', 401)];
      const sale = await newSale(ctx);
      expect((await chargeSale(ctx.deps, sale.id, SECOND_WALLET)).status).toBe('PAID');
      expect(ctx.repo.wallets.get(ctx.second.id)).toMatchObject({
        grantAccessToken: 'token-2-rotated',
        grantManageUrl: 'https://auth.test/token/2',
      });
      expect(ctx.repo.wallets.get(ctx.buyer.wallet.id)!.grantAccessToken).toBe('token-1');
    });
  });

  describe('a vendor with several receiving wallets', () => {
    const TIENDA_EUR = 'https://ilp.test/tienda-eur';

    it("creates the incoming payment on the sale's receiving wallet, in its asset", async () => {
      const ctx = setup();
      const eur = ctx.repo.addVendorWallet(ctx.vendor.id, { walletAddress: TIENDA_EUR, assetCode: 'EUR' });
      ctx.op.script.wallets[TIENDA_EUR] = { assetCode: 'EUR' };
      const sale = await createSale(ctx.deps, ctx.vendor.id, '1000', eur.id);
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({ status: 'PAID', vendorWalletId: eur.id, assetCode: 'EUR', debitAssetCode: 'USD' });
      expect(ctx.op.calls.slice(0, 3)).toEqual([`wallet:${TIENDA_EUR}`, `wallet:${BUYER_WALLET}`, 'incoming:1000']);
    });

    it('fails with WALLET_ERROR when its receiving wallet was removed, before any wallet call', async () => {
      const ctx = setup();
      const eur = ctx.repo.addVendorWallet(ctx.vendor.id, { walletAddress: TIENDA_EUR });
      const sale = await createSale(ctx.deps, ctx.vendor.id, '1000', eur.id);
      await ctx.repo.deleteVendorWallet(eur.id);
      const result = await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
      expect(result).toMatchObject({
        status: 'FAILED',
        failureCode: 'WALLET_ERROR',
        failureMessage: 'Receiving wallet was removed',
        vendorWalletId: null,
      });
      expect(ctx.op.calls).toEqual([]);
      const range = { start: new Date(0), end: new Date('2100-01-01') };
      expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(0n);
    });
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
    expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(0n);
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
    expect(ctx.repo.wallets.get(ctx.buyer.wallet.id)).toMatchObject({
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
    expect(ctx.repo.wallets.get(ctx.buyer.wallet.id)!.grantAccessToken).toBe('token-1');
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
    expect(await ctx.repo.sumSpent(ctx.buyer.wallet.id, range)).toBe(1200n);
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
