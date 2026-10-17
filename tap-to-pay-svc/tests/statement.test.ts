import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { renderStatementPdf } from '../src/services/statement-pdf.js';
import { buildStatement, parseMonth } from '../src/services/statement.js';
import { makeDeps } from './fakes.js';

// 2026-10-20 10:00 in Bogotá.
const NOW = new Date('2026-10-20T15:00:00Z');
const at = (iso: string) => new Date(`${iso}-05:00`);

function setup() {
  const ctx = makeDeps({ now: () => NOW });
  const vendor = ctx.repo.addVendor();
  const ana = ctx.repo.addBuyer();
  const luis = ctx.repo.addBuyer({ name: 'Luis', wallet: { walletAddress: 'https://ilp.test/luis' } });
  const sale = (iso: string, amount: bigint, extra: Record<string, unknown> = {}) =>
    ctx.repo.addSale({ vendorId: vendor.id, buyerId: ana.id, status: 'PAID', amount, createdAt: at(iso), ...extra });
  // October: four paid (Ana twice, Luis twice: both repeat), one refused, one pending.
  sale('2026-10-02T09:15:00', 1000n);
  sale('2026-10-02T09:45:00', 3000n, { chargedVia: 'LINK' });
  sale('2026-10-10T18:00:00', 2000n, { buyerId: luis.id });
  sale('2026-10-11T09:30:00', 6000n, { buyerId: luis.id, chargedVia: 'RECURRING' });
  sale('2026-10-12T12:00:00', 500n, { status: 'FAILED', failureCode: 'LIMIT_DAILY' });
  sale('2026-10-13T12:00:00', 700n, { status: 'CHARGING' });
  // September: two paid. July: one. Before the 6-month window: ignored.
  sale('2026-09-05T10:00:00', 4000n);
  sale('2026-09-06T10:00:00', 4000n);
  sale('2026-07-01T10:00:00', 9000n);
  sale('2026-03-01T10:00:00', 99000n);
  // Another vendor's sale never counts.
  const other = ctx.repo.addVendor({ name: 'Otra', wallet: { walletAddress: 'https://ilp.test/otra' } });
  ctx.repo.addSale({ vendorId: other.id, status: 'PAID', amount: 7777n, createdAt: at('2026-10-03T10:00:00') });
  return { ...ctx, vendor };
}

describe('parseMonth', () => {
  it('defaults to the current local month and refuses a future or malformed one', () => {
    const { deps } = setup();
    expect(parseMonth(deps)).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(deps, '2026-09')).toEqual({ year: 2026, month: 9 });
    expect(() => parseMonth(deps, '2026-11')).toThrow('month has not started yet');
    expect(() => parseMonth(deps, '2026-13')).toThrow('month must be YYYY-MM');
    expect(() => parseMonth(deps, 'octubre')).toThrow('month must be YYYY-MM');
  });
});

describe('buildStatement', () => {
  it('computes the figures a lender asks for, per receiving wallet', async () => {
    const { deps, vendor } = setup();
    const statement = await buildStatement(deps, vendor.id, { year: 2026, month: 10 });
    expect(statement.month).toBe('2026-10');
    expect(statement.verificationCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const [w] = statement.wallets;
    expect(w).toMatchObject({
      assetCode: 'USD',
      paid: { count: 4, total: 12000n },
      pending: { count: 1, total: 700n },
      failed: { count: 1, byReason: [{ code: 'LIMIT_DAILY', count: 1 }] },
      approvalRate: 0.8,
      averageTicket: 3000n,
      medianTicket: 2500n,
      largestSale: 6000n,
      daysInMonth: 31,
      activeDays: 3,
      averagePerActiveDay: 4000n,
      bestDay: { date: '2026-10-11', count: 1, total: 6000n },
      peakHour: { hour: 9, count: 3 },
      uniqueBuyers: 2,
      repeatBuyers: 2,
      previousMonth: { count: 2, total: 8000n },
    });
    expect(w.growth.total).toBeCloseTo(0.5);
    expect(w.growth.count).toBeCloseTo(1);
    expect(w.channels).toEqual([
      { channel: 'NFC', count: 2, total: 3000n },
      { channel: 'LINK', count: 1, total: 3000n },
      { channel: 'RECURRING', count: 1, total: 6000n },
    ]);
    expect(w.daily[1]).toEqual({ day: 2, count: 2, total: 4000n });
    expect(w.trend.map((m) => [m.month, m.total])).toEqual([
      ['2026-05', 0n],
      ['2026-06', 0n],
      ['2026-07', 9000n],
      ['2026-08', 0n],
      ['2026-09', 8000n],
      ['2026-10', 12000n],
    ]);
  });

  it('reports a month without sales, with no growth against an empty one', async () => {
    const { deps, vendor } = setup();
    const [w] = (await buildStatement(deps, vendor.id, { year: 2026, month: 8 })).wallets;
    expect(w).toMatchObject({ paid: { count: 0, total: 0n }, approvalRate: null, bestDay: null, peakHour: null });
    expect(w.growth).toEqual({ total: -1, count: -1 });
  });

  it('refuses an unknown vendor', async () => {
    const { deps } = setup();
    await expect(buildStatement(deps, 'nope', { year: 2026, month: 10 })).rejects.toMatchObject({
      status: 404,
      code: 'VENDOR_NOT_FOUND',
    });
  });

  it('renders a PDF in Spanish and English', async () => {
    const { deps, vendor } = setup();
    const statement = await buildStatement(deps, vendor.id, { year: 2026, month: 10 });
    for (const lang of ['es', 'en'] as const) {
      const pdf = await renderStatementPdf(statement, lang);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1500);
    }
  });
});

describe('GET /vendors/:id/statement.pdf', () => {
  it('answers the PDF, and JSON errors for a bad month or vendor', async () => {
    const ctx = setup();
    const app = createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
    const ok = await request(app).get(`/vendors/${ctx.vendor.id}/statement.pdf?month=2026-10`).buffer(true);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/pdf');
    expect(ok.headers['content-disposition']).toBe('inline; filename="resumen-2026-10.pdf"');
    expect(Buffer.from(ok.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(`/vendors/${ctx.vendor.id}/statement.pdf?month=2027-01`)).status).toBe(400);
    expect((await request(app).get('/vendors/nope/statement.pdf')).body.error.code).toBe('VENDOR_NOT_FOUND');
  });
});
