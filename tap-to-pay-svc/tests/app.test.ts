import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { WalletError } from '../src/open-payments/types.js';
import { BUYER_WALLET, makeDeps } from './fakes.js';

const CLIENT = 'https://ilp.test/service';

function setup() {
  const ctx = makeDeps();
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  const app = createApp(ctx.deps, { clientWalletAddress: CLIENT });
  return { ...ctx, app, buyer, vendor };
}

describe('HTTP surface', () => {
  it('GET /health', async () => {
    const res = await request(setup().app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true, clientWalletAddress: CLIENT }, error: null });
  });

  it('lists vendors and buyers', async () => {
    const { app } = setup();
    const vendors = await request(app).get('/vendors');
    expect(vendors.body.data).toEqual([
      expect.objectContaining({ name: 'Tienda', assetCode: 'USD', wallets: [expect.objectContaining({ isDefault: true })] }),
    ]);
    const buyers = await request(app).get('/buyers');
    expect(buyers.body.data).toEqual([
      expect.objectContaining({ name: 'Ana', hasGrant: true, wallets: [expect.objectContaining({ isDefault: true })] }),
    ]);
  });

  it('validates POST /sales', async () => {
    const { app, vendor } = setup();
    const decimal = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '12.50' });
    expect(decimal.status).toBe(400);
    expect(decimal.body.error).toEqual({
      code: 'VALIDATION',
      message: 'amount must be digits in the smallest unit, got "12.50"',
    });
    const missing = await request(app).post('/sales').send({ vendorId: vendor.id });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION');
  });

  it('rejects malformed JSON and a bad wallet address', async () => {
    const { app, vendor } = setup();
    const res = await request(app).post('/sales').set('content-type', 'application/json').send('{"amount":');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION', message: 'Invalid JSON body' });

    const sale = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '1200' });
    const charge = await request(app).post(`/sales/${sale.body.data.id}/charge`).send({ walletAddress: 'nope' });
    expect(charge.status).toBe(400);
    expect(charge.body.error.message).toBe('walletAddress: Invalid URL');
  });

  it('creates, charges to PAID, refuses a second charge, and updates the buyer', async () => {
    const { app, vendor, buyer } = setup();
    const created = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '1200' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'AWAITING_TAP', vendorName: 'Tienda' });
    const id = created.body.data.id;

    const charged = await request(app).post(`/sales/${id}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(charged.status).toBe(200);
    expect(charged.body.data.status).toBe('PAID');

    const again = await request(app).post(`/sales/${id}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({ code: 'SALE_NOT_CHARGEABLE', message: 'Sale is PAID' });

    const read = await request(app).get(`/sales/${id}`);
    expect(read.body.data.status).toBe('PAID');

    const history = await request(app).get(`/buyers/${buyer.id}/sales`);
    expect(history.body.data.remainingToday).toBe('3800');
    expect(history.body.data.sales[0]).toMatchObject({ id, vendorName: 'Tienda' });
  });

  it('a refused charge is a 200 with the sale FAILED', async () => {
    const { app, vendor } = setup();
    const created = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '2500' });
    const res = await request(app).post(`/sales/${created.body.data.id}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'FAILED', failureCode: 'LIMIT_PER_PAYMENT' });
  });

  it("shows a refusal of the buyer's wallet first in their history, which takes a limit", async () => {
    const { app, buyer, vendor } = setup();
    const paid = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '1200' });
    await request(app).post(`/sales/${paid.body.data.id}/charge`).send({ walletAddress: BUYER_WALLET });
    const over = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '2500' });
    await request(app).post(`/sales/${over.body.data.id}/charge`).send({ walletAddress: BUYER_WALLET });

    const latest = await request(app).get(`/buyers/${buyer.id}/sales?limit=1`);
    expect(latest.status).toBe(200);
    expect(latest.body.data.sales).toEqual([
      expect.objectContaining({
        id: over.body.data.id,
        status: 'FAILED',
        failureCode: 'LIMIT_PER_PAYMENT',
        buyerWalletId: buyer.wallet.id,
      }),
    ]);
    expect(latest.body.data.remainingToday).toBe('3800'); // the refusal never counts
    expect((await request(app).get(`/buyers/${buyer.id}/sales`)).body.data.sales).toHaveLength(2);
    // The vendor now sees who was refused.
    const forVendor = await request(app).get(`/vendors/${vendor.id}/sales?limit=1`);
    expect(forVendor.body.data[0]).toMatchObject({ id: over.body.data.id, buyerName: 'Ana' });

    for (const limit of ['0', '101', 'abc']) {
      const res = await request(app).get(`/buyers/${buyer.id}/sales?limit=${limit}`);
      expect(res.status, limit).toBe(400);
      expect(res.body.error.code, limit).toBe('VALIDATION');
    }
  });

  it('PATCH /buyers/:id/limits', async () => {
    const { app, buyer } = setup();
    const ok = await request(app)
      .patch(`/buyers/${buyer.id}/limits`)
      .send({ perPaymentLimit: '3000', dailyLimit: '9000' });
    expect(ok.body.data).toMatchObject({ perPaymentLimit: '3000', dailyLimit: '9000' });
    const bad = await request(app)
      .patch(`/buyers/${buyer.id}/limits`)
      .send({ perPaymentLimit: '9000', dailyLimit: '3000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe('perPaymentLimit must be ≤ dailyLimit');
  });

  it('adds, defaults, caps, filters and removes wallets', async () => {
    const { app, buyer, vendor, op } = setup();
    const SAVINGS = 'https://ilp.test/ana-ahorros';
    op.script.wallets[SAVINGS] = { assetCode: 'EUR' };

    const added = await request(app).post(`/buyers/${buyer.id}/wallets`).send({ walletAddress: SAVINGS });
    expect(added.status).toBe(201);
    expect(added.body.data.wallets).toEqual([
      expect.objectContaining({ id: buyer.wallet.id, isDefault: true }),
      expect.objectContaining({ walletAddress: SAVINGS, assetCode: 'EUR', hasGrant: false, isDefault: false }),
    ]);
    const savingsId = added.body.data.wallets[1].id;

    const switched = await request(app).put(`/buyers/${buyer.id}/default-wallet`).send({ walletId: savingsId });
    expect(switched.body.data).toMatchObject({ defaultWalletId: savingsId, walletAddress: SAVINGS });

    const capped = await request(app)
      .patch(`/buyers/${buyer.id}/wallets/${savingsId}/limits`)
      .send({ perPaymentLimit: '100', dailyLimit: '300' });
    expect(capped.body.data.wallets[1]).toMatchObject({ perPaymentLimit: '100', dailyLimit: '300' });

    // The first wallet still pays by its address, default or not; the sale shows in its own history only.
    const sale = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '1200' });
    await request(app).post(`/sales/${sale.body.data.id}/charge`).send({ walletAddress: BUYER_WALLET });
    const own = await request(app).get(`/buyers/${buyer.id}/sales?walletId=${buyer.wallet.id}`);
    expect(own.body.data).toMatchObject({ remainingToday: '3800', sales: [{ buyerWalletId: buyer.wallet.id }] });
    const other = await request(app).get(`/buyers/${buyer.id}/sales?walletId=${savingsId}`);
    expect(other.body.data).toEqual({ remainingToday: '300', sales: [] });

    const removed = await request(app).delete(`/buyers/${buyer.id}/wallets/${savingsId}`);
    expect(removed.body.data).toMatchObject({
      defaultWalletId: buyer.wallet.id,
      wallets: [{ id: buyer.wallet.id, isDefault: true }],
    });
    const last = await request(app).delete(`/buyers/${buyer.id}/wallets/${buyer.wallet.id}`);
    expect(last.status).toBe(409);
    expect(last.body.error).toEqual({ code: 'LAST_WALLET', message: 'A buyer keeps at least one wallet' });
  });

  it('names the wallet errors', async () => {
    const { app, buyer, op } = setup();
    const post = (id: string, body: object) => request(app).post(`/buyers/${id}/wallets`).send(body);
    const taken = await post(buyer.id, { walletAddress: BUYER_WALLET });
    expect([taken.status, taken.body.error.code]).toEqual([409, 'WALLET_TAKEN']);
    const bad = await post(buyer.id, { walletAddress: 'nope' });
    expect(bad.body.error).toEqual({ code: 'VALIDATION', message: 'walletAddress: Invalid URL' });
    const unknown = await post('x', { walletAddress: 'https://ilp.test/x' });
    expect([unknown.status, unknown.body.error.code]).toEqual([404, 'BUYER_NOT_FOUND']);
    op.script.failOn.wallet = new WalletError('Could not find wallet address', 404);
    const unreachable = await post(buyer.id, { walletAddress: 'https://ilp.test/x' });
    expect(unreachable.status).toBe(400);
    expect(unreachable.body.error).toEqual({ code: 'WALLET_UNREACHABLE', message: 'Could not find wallet address' });

    const foreign = await request(app).put(`/buyers/${buyer.id}/default-wallet`).send({ walletId: 'w-x' });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toEqual({ code: 'WALLET_NOT_FOUND', message: `Wallet w-x not found for buyer ${buyer.id}` });
    expect((await request(app).put(`/buyers/${buyer.id}/default-wallet`).send({})).status).toBe(400);
    expect((await request(app).get(`/buyers/${buyer.id}/sales?walletId=w-x`)).status).toBe(404);
  });

  it('names its 404s', async () => {
    const { app } = setup();
    expect((await request(app).get('/buyers/x')).body.error).toEqual({
      code: 'BUYER_NOT_FOUND',
      message: 'Buyer x not found',
    });
    expect((await request(app).get('/sales/x')).body.error.code).toBe('SALE_NOT_FOUND');
    expect((await request(app).post('/sales').send({ vendorId: 'x', amount: '1' })).body.error.code).toBe(
      'VENDOR_NOT_FOUND',
    );
    const unknown = await request(app).get('/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });
});
