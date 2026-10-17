import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { listBillers, parseBillerWallets } from '../src/services/billers.js';
import { listBuyerViews } from '../src/services/buyers.js';
import {
  addRecurring,
  getVendorPayer,
  listRecurring,
  nextRun,
  parseDecimal,
  payRecurringNow,
  removeRecurring,
  runDueRecurring,
  setRecurringActive,
} from '../src/services/recurring.js';
import { listVendorViews } from '../src/services/vendors.js';
import { BILLERS_WALLET, EPM_WALLET, makeDeps, NOW, VENDOR_WALLET } from './fakes.js';

function setup() {
  let now = NOW; // 2026-10-14 10:00 in Bogotá
  const ctx = makeDeps({ now: () => now });
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  const setNow = (iso: string) => (now = new Date(iso));
  return { ...ctx, buyer, vendor, setNow };
}

/** The vendor's payer identity, authorized as grant:buyer would leave it. */
async function authorizedPayer(ctx: ReturnType<typeof setup>) {
  const view = await getVendorPayer(ctx.deps, ctx.vendor.id);
  for (const w of view.wallets) {
    Object.assign(ctx.repo.wallets.get(w.id)!, { grantAccessToken: 'vendor-token', grantManageUrl: 'https://auth.test/token/v' });
  }
  return view;
}

const epm = { billerId: 'epm', reference: '123456', amount: '12.50', dayOfMonth: 15 };

describe('billers', () => {
  it('lists the Colombian catalog, available when a wallet is configured for it', () => {
    const { deps } = setup();
    const billers = listBillers(deps);
    expect(billers.map((b) => b.id)).toEqual(['epm', 'claro', 'tigo', 'movistar', 'etb', 'vanti']);
    expect(billers.every((b) => b.available)).toBe(true);
    expect(listBillers({ billers: { wallets: { epm: EPM_WALLET } } }).filter((b) => b.available).map((b) => b.id)).toEqual(['epm']);
  });

  it('reads BILLER_WALLETS', () => {
    expect(parseBillerWallets('epm=https://ilp.test/epm, CLARO = https://ilp.test/claro,bad,tigo=nope')).toEqual({
      epm: 'https://ilp.test/epm',
      claro: 'https://ilp.test/claro',
    });
    expect(parseBillerWallets(undefined)).toEqual({});
  });
});

describe("the vendor's payer identity", () => {
  it('holds the vendor wallets, is created once, needs a grant, and is not a phone buyer', async () => {
    const ctx = setup();
    const payer = await getVendorPayer(ctx.deps, ctx.vendor.id);
    expect(payer.wallets).toEqual([
      expect.objectContaining({
        walletAddress: VENDOR_WALLET,
        hasGrant: false,
        isDefault: true,
        grantCommand: `npm run grant:buyer -- --buyer ${VENDOR_WALLET}`,
      }),
    ]);
    expect((await getVendorPayer(ctx.deps, ctx.vendor.id)).buyerId).toBe(payer.buyerId);
    expect((await ctx.repo.getVendor(ctx.vendor.id))!.payerBuyerId).toBe(payer.buyerId);
    expect((await listBuyerViews(ctx.deps)).map((b) => b.name)).toEqual(['Ana']);
  });

  it("adds a vendor's later wallets", async () => {
    const ctx = setup();
    await getVendorPayer(ctx.deps, ctx.vendor.id);
    ctx.repo.addVendorWallet(ctx.vendor.id, { walletAddress: 'https://ilp.test/tienda-eur', assetCode: 'EUR' });
    expect((await getVendorPayer(ctx.deps, ctx.vendor.id)).wallets.map((w) => w.assetCode)).toEqual(['USD', 'EUR']);
  });
});

describe('enrolling', () => {
  it('enrols the vendor in a catalog biller, priced in its wallet asset, next on the chosen day at 08:00', async () => {
    const ctx = setup();
    const view = await addRecurring(ctx.deps, ctx.vendor.id, epm);
    expect(view).toMatchObject({
      billerId: 'epm',
      payeeName: 'EPM',
      payeeWalletAddress: EPM_WALLET,
      reference: '123456',
      amount: '1250',
      amountFormatted: '12.50',
      assetCode: 'USD',
      dayOfMonth: 15,
      active: true,
      walletId: null,
      nextRunAt: '2026-10-15T13:00:00.000Z',
      lastStatus: null,
    });
    expect(ctx.op.calls).toEqual([`wallet:${EPM_WALLET}`]);
    expect(await listRecurring(ctx.deps, ctx.vendor.id)).toHaveLength(1);
  });

  it('uses the default billers wallet, and any Interledger wallet the vendor types', async () => {
    const ctx = setup();
    expect((await addRecurring(ctx.deps, ctx.vendor.id, { ...epm, billerId: 'claro' })).payeeWalletAddress).toBe(BILLERS_WALLET);
    const custom = await addRecurring(ctx.deps, ctx.vendor.id, {
      payeeName: ' Arriendo del local ',
      payeeWalletAddress: 'https://ilp.test/arrendador',
      amount: '800',
      dayOfMonth: 1,
    });
    expect(custom).toMatchObject({ billerId: null, payeeName: 'Arriendo del local', amount: '80000' });
  });

  it('schedules next month when the day has passed', () => {
    const { deps } = setup();
    expect(nextRun(deps, 14).toISOString()).toBe('2026-11-14T13:00:00.000Z');
    expect(nextRun(deps, 1).toISOString()).toBe('2026-11-01T13:00:00.000Z');
    expect(nextRun(deps, 28).toISOString()).toBe('2026-10-28T13:00:00.000Z');
  });

  it('validates before calling the wallet', async () => {
    const ctx = setup();
    const add = (input: object) => addRecurring(ctx.deps, ctx.vendor.id, { ...epm, ...input });
    await expect(add({ dayOfMonth: 29 })).rejects.toMatchObject({ status: 400, message: 'dayOfMonth must be between 1 and 28' });
    await expect(add({ billerId: 'nope' })).rejects.toMatchObject({ status: 404, code: 'BILLER_NOT_FOUND' });
    await expect(add({ billerId: undefined })).rejects.toMatchObject({ message: 'payeeName is required without billerId' });
    await expect(add({ billerId: undefined, payeeName: 'Yo', payeeWalletAddress: VENDOR_WALLET })).rejects.toMatchObject({
      message: 'A vendor cannot pay one of its own wallets',
    });
    await expect(add({ walletId: 'nope' })).rejects.toMatchObject({ status: 404, code: 'WALLET_NOT_FOUND' });
    expect(ctx.op.calls).toEqual([]);
    await expect(add({ amount: '1.234' })).rejects.toMatchObject({ message: 'amount allows at most 2 decimals' });
    await expect(addRecurring(ctx.deps, 'nope', epm)).rejects.toMatchObject({ code: 'VENDOR_NOT_FOUND' });
  });

  it('refuses a biller with no wallet configured', async () => {
    const ctx = setup();
    ctx.deps.billers = { wallets: {} };
    await expect(addRecurring(ctx.deps, ctx.vendor.id, epm)).rejects.toMatchObject({ status: 409, code: 'BILLER_UNAVAILABLE' });
  });

  it('parses amounts in whole units', () => {
    expect(parseDecimal('45000', 2)).toBe(4500000n);
    expect(parseDecimal('45000,5', 2)).toBe(4500050n);
    expect(() => parseDecimal('45.000,50', 2)).toThrow();
    expect(() => parseDecimal('0', 2)).toThrow('amount must be greater than zero');
  });
});

describe('paying', () => {
  it("pays now from the vendor's own wallet to a BILLER vendor, kept out of the vendor list", async () => {
    const ctx = setup();
    const payer = await authorizedPayer(ctx);
    const { id } = await addRecurring(ctx.deps, ctx.vendor.id, epm);
    const sale = await payRecurringNow(ctx.deps, ctx.vendor.id, id);
    expect(sale).toMatchObject({
      status: 'PAID',
      chargedVia: 'RECURRING',
      amount: '1250',
      buyerId: payer.buyerId,
      description: 'EPM · 123456 · pago recurrente',
    });
    // The outgoing payment uses the vendor's own grant token.
    expect(ctx.op.calls.filter((c) => c.startsWith('outgoing:'))).toEqual([expect.stringMatching(/:vendor-token$/)]);
    expect(await ctx.repo.getVendor(sale.vendorId)).toMatchObject({ name: 'EPM', kind: 'BILLER' });
    expect((await listVendorViews(ctx.deps)).map((v) => v.name)).toEqual(['Tienda']);
    const [row] = await listRecurring(ctx.deps, ctx.vendor.id);
    expect(row).toMatchObject({ lastStatus: 'PAID', lastSaleId: sale.id, nextRunAt: '2026-10-15T13:00:00.000Z' });
  });

  it("refuses without the vendor's grant, recorded, with no money moved", async () => {
    const ctx = setup();
    const { id } = await addRecurring(ctx.deps, ctx.vendor.id, epm);
    const sale = await payRecurringNow(ctx.deps, ctx.vendor.id, id);
    expect(sale).toMatchObject({ status: 'FAILED', failureCode: 'GRANT_MISSING' });
    expect(ctx.op.calls.some((c) => c.startsWith('outgoing'))).toBe(false);
    expect((await listRecurring(ctx.deps, ctx.vendor.id))[0]).toMatchObject({ lastStatus: 'FAILED' });
  });

  it('runs each due payment once per month', async () => {
    const ctx = setup();
    await authorizedPayer(ctx);
    await addRecurring(ctx.deps, ctx.vendor.id, epm);
    expect(await runDueRecurring(ctx.deps)).toBe(0);
    ctx.setNow('2026-10-15T13:05:00Z');
    expect(await runDueRecurring(ctx.deps)).toBe(1);
    expect(await runDueRecurring(ctx.deps)).toBe(0);
    const [row] = await listRecurring(ctx.deps, ctx.vendor.id);
    expect(row).toMatchObject({ lastStatus: 'PAID', nextRunAt: '2026-11-15T13:00:00.000Z' });
  });

  it('two ticks at once charge one payment', async () => {
    const ctx = setup();
    await authorizedPayer(ctx);
    await addRecurring(ctx.deps, ctx.vendor.id, epm);
    ctx.setNow('2026-10-15T13:05:00Z');
    const [a, b] = await Promise.all([runDueRecurring(ctx.deps), runDueRecurring(ctx.deps)]);
    expect(a + b).toBe(1);
    expect(ctx.op.calls.filter((c) => c.startsWith('outgoing'))).toHaveLength(1);
  });

  it('pauses, resumes from now, and removes', async () => {
    const ctx = setup();
    const { id } = await addRecurring(ctx.deps, ctx.vendor.id, epm);
    expect((await setRecurringActive(ctx.deps, ctx.vendor.id, id, false)).active).toBe(false);
    ctx.setNow('2026-10-20T15:00:00Z');
    expect(await runDueRecurring(ctx.deps)).toBe(0);
    expect(await setRecurringActive(ctx.deps, ctx.vendor.id, id, true)).toMatchObject({
      active: true,
      nextRunAt: '2026-11-15T13:00:00.000Z',
    });
    const other = ctx.repo.addVendor({ name: 'Otra', wallet: { walletAddress: 'https://ilp.test/otra' } });
    await expect(removeRecurring(ctx.deps, other.id, id)).rejects.toMatchObject({ status: 404, code: 'RECURRING_NOT_FOUND' });
    await removeRecurring(ctx.deps, ctx.vendor.id, id);
    expect(await listRecurring(ctx.deps, ctx.vendor.id)).toEqual([]);
  });
});

describe('HTTP surface', () => {
  it('lists billers and the payer, enrols, pays, pauses and removes', async () => {
    const ctx = setup();
    const app = createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
    const base = `/vendors/${ctx.vendor.id}`;
    expect((await request(app).get('/billers')).body.data[0]).toMatchObject({ id: 'epm', name: 'EPM', available: true });
    expect((await request(app).get(`${base}/payer`)).body.data.wallets[0]).toMatchObject({ hasGrant: false });
    const created = await request(app).post(`${base}/recurring`).send(epm);
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await request(app).get(`${base}/recurring`)).body.data).toHaveLength(1);
    expect((await request(app).post(`${base}/recurring/${id}/pay`)).body.data.failureCode).toBe('GRANT_MISSING');
    expect((await request(app).patch(`${base}/recurring/${id}`).send({ active: false })).body.data.active).toBe(false);
    expect((await request(app).delete(`${base}/recurring/${id}`)).body.data).toEqual({ removed: true });
    expect((await request(app).post(`${base}/recurring`).send({ ...epm, dayOfMonth: '15' })).status).toBe(400);
  });
});
