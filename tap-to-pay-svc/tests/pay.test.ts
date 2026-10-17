import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { publicBaseUrl } from '../src/services/pay.js';
import { BUYER_WALLET, makeDeps } from './fakes.js';

const CLIENT = 'https://ilp.test/service';

function setup(publicUrl?: string) {
  const ctx = makeDeps();
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  const app = createApp(ctx.deps, { clientWalletAddress: CLIENT, publicUrl });
  return { ...ctx, app, buyer, vendor };
}

async function newSale(app: ReturnType<typeof setup>['app'], vendorId: string, amount = '1200') {
  const res = await request(app).post('/sales').send({ vendorId, amount });
  return res.body.data as { id: string };
}

describe('payment page', () => {
  it('GET /pay/:id renders the sale for the buyer', async () => {
    const { app, vendor } = setup();
    const sale = await newSale(app, vendor.id);
    const res = await request(app).get(`/pay/${sale.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Cobro de Tienda');
    expect(res.text).toContain('12.00');
    expect(res.text).toContain(`"id":"${sale.id}","status":"AWAITING_TAP"`);
    expect(res.text).toContain('/charge');
  });

  it('GET /pay/:id of an unknown sale is an HTML 404', async () => {
    const res = await request(setup().app).get('/pay/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Cobro no encontrado');
  });

  it('escapes the vendor name in the page', async () => {
    const ctx = setup();
    ctx.repo.vendorWallets.get(ctx.vendor.wallet.id)!.publicName = '<script>alert(1)</script>';
    const sale = await newSale(ctx.app, ctx.vendor.id);
    const res = await request(ctx.app).get(`/pay/${sale.id}`);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the outcome once the sale is paid through the same charge as a tap', async () => {
    const { app, vendor } = setup();
    const sale = await newSale(app, vendor.id);
    const charge = await request(app).post(`/sales/${sale.id}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(charge.body.data.status).toBe('PAID');
    const res = await request(app).get(`/pay/${sale.id}`);
    expect(res.text).toContain(`"status":"PAID"`);
  });
});

describe('payment link and QR', () => {
  it('GET /sales/:id/pay-link builds the URL from the request, honouring proxy headers', async () => {
    const { app, vendor } = setup();
    const sale = await newSale(app, vendor.id);
    const res = await request(app)
      .get(`/sales/${sale.id}/pay-link`)
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'pay.example.com');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe(`https://pay.example.com/pay/${sale.id}`);
    expect(res.body.data.whatsappUrl.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(res.body.data.whatsappUrl.slice('https://wa.me/?text='.length));
    expect(text).toBe(res.body.data.text);
    expect(text).toContain('12.00 USD');
    expect(text).toContain('Tienda');
    expect(text).toContain(`https://pay.example.com/pay/${sale.id}`);
  });

  it('PUBLIC_URL wins over the request host', async () => {
    const { app, vendor } = setup('https://tap.example.org/');
    const sale = await newSale(app, vendor.id);
    const res = await request(app).get(`/sales/${sale.id}/pay-link`).set('x-forwarded-host', 'other.example.com');
    expect(res.body.data.url).toBe(`https://tap.example.org/pay/${sale.id}`);
  });

  it('GET /sales/:id/qr.png answers a PNG, and 404 for an unknown sale', async () => {
    const { app, vendor } = setup();
    const sale = await newSale(app, vendor.id);
    const res = await request(app).get(`/sales/${sale.id}/qr.png`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Buffer;
    expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    const missing = await request(app).get('/sales/nope/qr.png');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SALE_NOT_FOUND');
  });

  it('publicBaseUrl falls back to the protocol and host, and takes the first proxy value', () => {
    const req = (headers: Record<string, string>, protocol = 'http') => ({
      protocol,
      get: (name: string) => headers[name.toLowerCase()],
    });
    expect(publicBaseUrl(req({ host: '192.168.1.5:4000' }))).toBe('http://192.168.1.5:4000');
    expect(publicBaseUrl(req({ host: 'a', 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'b.example, c' }))).toBe(
      'https://b.example',
    );
    expect(publicBaseUrl(req({ host: 'a' }), 'https://x.example///')).toBe('https://x.example');
  });
});
