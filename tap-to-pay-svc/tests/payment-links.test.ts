import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  chargePaymentLink,
  createPaymentLink,
  getPaymentRequest,
  paymentLinkPage,
} from '../src/services/payment-links.js';
import { chargeSale, createSale } from '../src/services/sales.js';
import { BUYER_WALLET, makeDeps, NOW, PUBLIC_BASE_URL } from './fakes.js';

function setup() {
  let now = NOW;
  const ctx = makeDeps({ now: () => now });
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  const advance = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
  return { ...ctx, buyer, vendor, advance };
}

async function saleWithLink(ctx: ReturnType<typeof setup>, description = 'Almuerzo') {
  const sale = await createSale(ctx.deps, ctx.vendor.id, '1200', undefined, description);
  const link = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL);
  return { sale, link };
}

describe('createSale with a description', () => {
  it('stores it trimmed and returns it on the sale', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1200', undefined, '  Almuerzo ');
    expect(sale).toMatchObject({ description: 'Almuerzo', chargedVia: null });
    expect((await createSale(ctx.deps, ctx.vendor.id, '1200', undefined, '   ')).description).toBeNull();
  });

  it('refuses one over 140 characters', async () => {
    const ctx = setup();
    await expect(createSale(ctx.deps, ctx.vendor.id, '1200', undefined, 'x'.repeat(141))).rejects.toMatchObject({
      status: 400,
      message: 'description must be at most 140 characters',
    });
  });
});

describe('createPaymentLink', () => {
  it('groups thousands as the app does', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1234500');
    const es = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL);
    expect(es.message).toContain('12.345,00 USD');
    const en = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL, { lang: 'en' });
    expect(en.message).toContain('12,345.00 USD');
  });

  it('builds the link, the app URL, the QR and the WhatsApp message', async () => {
    const ctx = setup();
    const { sale, link } = await saleWithLink(ctx);
    expect(link.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(link).toMatchObject({
      saleId: sale.id,
      url: `${PUBLIC_BASE_URL}/p/${link.code}`,
      appUrl: `taptopayapp://pay/${link.code}`,
      qrPayload: `${PUBLIC_BASE_URL}/p/${link.code}`,
      qrSvgUrl: `${PUBLIC_BASE_URL}/pay/${link.code}/qr.svg`,
      expiresAt: '2026-10-14T16:00:00.000Z',
    });
    expect(link.message).toContain('*Tienda* te envió una solicitud de pago');
    expect(link.message).toContain('💰 *Monto:* 12,00 USD');
    expect(link.message).toContain('📝 *Concepto:* Almuerzo');
    expect(link.message).toContain(`🧾 *Referencia:* ${link.code}`);
    expect(link.message).toContain('¿Cómo pagar?');
    expect(link.message).toContain('confirma que el comercio sea *Tienda*');
    // The link alone on its line, so WhatsApp makes it tappable.
    expect(link.message.split('\n')).toContain(link.url);
    expect(link.whatsappUrl).toBe(`https://wa.me/?text=${encodeURIComponent(link.message)}`);
  });

  it('addresses WhatsApp to a phone with its country code, and writes English on request', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1200');
    const link = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL, { phone: '+57 300 123-4567', lang: 'en' });
    expect(link.whatsappUrl.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(link.message).toContain('*Tienda* sent you a payment request');
    expect(link.message).toContain('💰 *Amount:* 12.00 USD');
    expect(link.message).not.toContain('*For:*');
    expect(link.message).toContain('How to pay');
    await expect(createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL, { phone: '300' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('returns the same code while it is live, and a new one once it expired', async () => {
    const ctx = setup();
    const { sale, link } = await saleWithLink(ctx);
    expect((await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL)).code).toBe(link.code);
    ctx.advance(61);
    const renewed = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL);
    expect(renewed.code).not.toBe(link.code);
    await expect(getPaymentRequest(ctx.deps, link.code)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a sale that is no longer AWAITING_TAP, and an unknown sale', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1200');
    await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    await expect(createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL)).rejects.toMatchObject({
      status: 409,
      code: 'SALE_NOT_CHARGEABLE',
      message: 'Sale is PAID',
    });
    await expect(createPaymentLink(ctx.deps, 'nope', PUBLIC_BASE_URL)).rejects.toMatchObject({ status: 404 });
  });
});

describe('paying a link', () => {
  it('shows the buyer the charge, without wallet URLs', async () => {
    const ctx = setup();
    const { link } = await saleWithLink(ctx);
    const view = await getPaymentRequest(ctx.deps, link.code);
    expect(view).toMatchObject({
      vendorName: 'Tienda',
      amount: '1200',
      amountFormatted: '12.00',
      assetCode: 'USD',
      description: 'Almuerzo',
      status: 'AWAITING_TAP',
      expired: false,
    });
    expect(JSON.stringify(view)).not.toContain('ilp.test');
  });

  it('charges with the same rules as a tap and records the channel', async () => {
    const ctx = setup();
    const { link } = await saleWithLink(ctx);
    const paid = await chargePaymentLink(ctx.deps, link.code, BUYER_WALLET);
    expect(paid).toMatchObject({ status: 'PAID', chargedVia: 'LINK', buyerId: ctx.buyer.id });
    expect((await getPaymentRequest(ctx.deps, link.code)).status).toBe('PAID');
  });

  it('refuses through the same rules, recording the channel', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '2500');
    const link = await createPaymentLink(ctx.deps, sale.id, PUBLIC_BASE_URL);
    const refused = await chargePaymentLink(ctx.deps, link.code, BUYER_WALLET);
    expect(refused).toMatchObject({ status: 'FAILED', failureCode: 'LIMIT_PER_PAYMENT', chargedVia: 'LINK' });
    expect(ctx.op.calls).toEqual([]);
  });

  it('a tap records NFC', async () => {
    const ctx = setup();
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1200');
    expect((await chargeSale(ctx.deps, sale.id, BUYER_WALLET)).chargedVia).toBe('NFC');
  });

  it('refuses an expired link with 410, before any wallet call', async () => {
    const ctx = setup();
    const { link } = await saleWithLink(ctx);
    ctx.advance(60);
    expect((await getPaymentRequest(ctx.deps, link.code)).expired).toBe(true);
    await expect(chargePaymentLink(ctx.deps, link.code, BUYER_WALLET)).rejects.toMatchObject({
      status: 410,
      code: 'PAYMENT_LINK_EXPIRED',
    });
    expect(ctx.op.calls).toEqual([]);
  });

  it('a sale paid by tap cannot be paid again by its link', async () => {
    const ctx = setup();
    const { sale, link } = await saleWithLink(ctx);
    await chargeSale(ctx.deps, sale.id, BUYER_WALLET);
    await expect(chargePaymentLink(ctx.deps, link.code, BUYER_WALLET)).rejects.toMatchObject({
      status: 409,
      message: 'Sale is PAID',
    });
  });

  it('a tap and the link at the same instant create one outgoing payment', async () => {
    const ctx = setup();
    const { sale, link } = await saleWithLink(ctx);
    const results = await Promise.allSettled([
      chargeSale(ctx.deps, sale.id, BUYER_WALLET),
      chargePaymentLink(ctx.deps, link.code, BUYER_WALLET),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(ctx.op.calls.filter((c) => c.startsWith('outgoing'))).toHaveLength(1);
  });

  it('an unknown code is 404', async () => {
    const ctx = setup();
    await expect(chargePaymentLink(ctx.deps, 'nope', BUYER_WALLET)).rejects.toMatchObject({
      status: 404,
      code: 'PAYMENT_LINK_NOT_FOUND',
    });
  });
});

describe('the link page', () => {
  it('previews the charge and opens the app, escaping what the vendor typed', async () => {
    const ctx = setup();
    const { link } = await saleWithLink(ctx, '<b>Pan</b> & "café"');
    const page = await paymentLinkPage(ctx.deps, link.code, 'es');
    expect(page.status).toBe(200);
    expect(page.html).toContain('<meta property="og:title" content="Cobro de Tienda: 12.00 USD">');
    expect(page.html).toContain(`href="taptopayapp://pay/${link.code}"`);
    expect(page.html).toContain(`<input class="code" id="code" value="${link.code}" readonly`);
    expect(page.html).toContain('<button class="copy" id="copy" type="button">Copiar código</button>');
    expect(page.html).toContain('&lt;b&gt;Pan&lt;/b&gt; &amp; &quot;café&quot;');
    expect(page.html).not.toContain('<b>Pan</b>');
  });

  it('says when the charge is paid or expired, without the button', async () => {
    const ctx = setup();
    const { link } = await saleWithLink(ctx);
    ctx.advance(60);
    const expired = await paymentLinkPage(ctx.deps, link.code, 'es');
    expect(expired.html).toContain('Este link venció');
    expect(expired.html).not.toContain('taptopayapp://');
    expect((await paymentLinkPage(ctx.deps, 'nope', 'en')).status).toBe(404);
  });
});

describe('HTTP surface', () => {
  function appFor(ctx: ReturnType<typeof setup>) {
    return createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
  }

  it('creates a sale with a description and its link, then pays it', async () => {
    const ctx = setup();
    const app = appFor(ctx);
    const sale = await request(app).post('/sales').send({ vendorId: ctx.vendor.id, amount: '1200', description: 'Arepa' });
    expect(sale.body.data.description).toBe('Arepa');

    const link = await request(app).post(`/sales/${sale.body.data.id}/payment-link`).send({ phone: '573001234567' });
    expect(link.status).toBe(200);
    const { code } = link.body.data;

    expect((await request(app).get(`/pay/${code}`)).body.data).toMatchObject({ description: 'Arepa', status: 'AWAITING_TAP' });
    const paid = await request(app).post(`/pay/${code}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(paid.body.data).toMatchObject({ status: 'PAID', chargedVia: 'LINK' });
  });

  it('serves the QR as SVG and the page as HTML', async () => {
    const ctx = setup();
    const app = appFor(ctx);
    const { link } = await saleWithLink(ctx);
    const qr = await request(app).get(`/pay/${link.code}/qr.svg`);
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toContain('image/svg+xml');
    // supertest buffers image/* bodies instead of decoding them as text.
    expect(Buffer.from(qr.body).toString()).toContain('<svg');
    const page = await request(app).get(`/p/${link.code}`);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Pagar en la app');
  });

  it('builds links from the request host when PUBLIC_BASE_URL is not set', async () => {
    const ctx = setup();
    ctx.deps.links = { ...ctx.deps.links, publicBaseUrl: undefined };
    const sale = await createSale(ctx.deps, ctx.vendor.id, '1200');
    const res = await request(appFor(ctx)).post(`/sales/${sale.id}/payment-link`).set('host', '192.168.1.16:4000').send({});
    expect(res.body.data.url).toMatch(/^http:\/\/192\.168\.1\.16:4000\/p\//);
  });

  it('names its errors', async () => {
    const ctx = setup();
    const app = appFor(ctx);
    expect((await request(app).get('/pay/nope')).body.error.code).toBe('PAYMENT_LINK_NOT_FOUND');
    expect((await request(app).post('/pay/nope/charge').send({ walletAddress: 'x' })).status).toBe(400);
    const { link } = await saleWithLink(ctx);
    ctx.advance(60);
    const expired = await request(app).post(`/pay/${link.code}/charge`).send({ walletAddress: BUYER_WALLET });
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe('PAYMENT_LINK_EXPIRED');
  });
});
