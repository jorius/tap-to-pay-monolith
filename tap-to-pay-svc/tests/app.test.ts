import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
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
    expect(vendors.body.data).toEqual([expect.objectContaining({ name: 'Tienda', assetCode: 'USD' })]);
    const buyers = await request(app).get('/buyers');
    expect(buyers.body.data).toEqual([expect.objectContaining({ name: 'Ana', hasGrant: true })]);
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
