import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { SaleStatus } from '../src/contracts.js';
import { WalletError } from '../src/open-payments/types.js';
import { createSale, type Deps } from '../src/services/sales.js';
import {
  addVendorWallet,
  findVendor,
  listVendorSales,
  listVendorViews,
  removeVendorWallet,
  setDefaultVendorWallet,
  vendorSummary,
} from '../src/services/vendors.js';
import { makeDeps, NOW, VENDOR_WALLET } from './fakes.js';

const TIENDA_EUR = 'https://ilp.test/tienda-eur';

// NOW is 2026-10-14T15:00Z, 10:00 in Bogotá: today runs 2026-10-14T05:00Z to 2026-10-15T05:00Z.
function setup(overrides: Partial<Deps> = {}) {
  const ctx = makeDeps(overrides);
  const vendor = ctx.repo.addVendor({ name: 'Tienda' });
  const ana = ctx.repo.addBuyer({ name: 'Ana' });
  const sale = (createdAt: string, status: SaleStatus, amount = 1000n, buyerId: string | null = ana.id) =>
    ctx.repo.addSale({ vendorId: vendor.id, buyerId, status, amount, createdAt: new Date(createdAt) });
  const app = createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
  return { ...ctx, vendor, ana, sale, app };
}

const days = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 9, from + i, 5)).toISOString());

describe('vendorSummary', () => {
  it('counts the local day, with 24 local hourly buckets of PAID sales', async () => {
    const { deps, repo, vendor, sale } = setup();
    sale('2026-10-14T04:59:59.999Z', 'PAID'); // 23:59:59.999 on the 13th: outside
    sale('2026-10-14T05:00:00.000Z', 'PAID', 1000n); // 00:00 on the 14th: first bucket
    sale('2026-10-15T04:59:00.000Z', 'PAID', 1001n); // 23:59 on the 14th: last bucket
    sale('2026-10-15T05:00:00.000Z', 'PAID'); // 00:00 on the 15th: outside
    sale('2026-10-14T15:00:00.000Z', 'CHARGING', 300n);
    sale('2026-10-14T15:00:00.000Z', 'FAILED', 999n, null); // a rule refusal
    sale('2026-10-14T15:00:00.000Z', 'FAILED', 500n); // a wallet error
    sale('2026-10-14T15:00:00.000Z', 'AWAITING_TAP', 700n, null);
    repo.addSale({ vendorId: repo.addVendor({ name: 'Otro' }).id, status: 'PAID', amount: 5000n });

    const summary = await vendorSummary(deps, vendor.id, 'today');
    expect(summary).toMatchObject({
      range: 'today',
      from: '2026-10-14T05:00:00.000Z',
      to: '2026-10-15T05:00:00.000Z',
      assetCode: 'USD',
      assetScale: 2,
      paid: { count: 2, total: '2001' },
      pending: { count: 1, total: '300' },
      failed: { count: 2 },
      averageTicket: '1000',
    });
    expect(summary.buckets).toHaveLength(24);
    expect(summary.buckets[0]).toEqual({ start: '2026-10-14T05:00:00.000Z', count: 1, total: '1000' });
    expect(summary.buckets[10].start).toBe('2026-10-14T15:00:00.000Z');
    expect(summary.buckets[23]).toEqual({ start: '2026-10-15T04:00:00.000Z', count: 1, total: '1001' });
    expect(summary.buckets.slice(1, 23).every((b) => b.count === 0 && b.total === '0')).toBe(true);
  });

  it('covers the last 7 local days with daily buckets, oldest first', async () => {
    const { deps, vendor, sale } = setup();
    sale('2026-10-08T04:59:59.999Z', 'PAID'); // 23:59:59.999 on Oct 7: outside
    sale('2026-10-08T05:00:00.000Z', 'PAID', 400n); // 00:00 on Oct 8: first day
    sale('2026-10-14T15:00:00.000Z', 'PAID', 601n); // today: last day
    const summary = await vendorSummary(deps, vendor.id, 'week');
    expect(summary).toMatchObject({
      range: 'week',
      from: '2026-10-08T05:00:00.000Z',
      to: '2026-10-15T05:00:00.000Z',
      paid: { count: 2, total: '1001' },
      averageTicket: '500',
    });
    expect(summary.buckets.map((b) => b.start)).toEqual(days(8, 7));
    expect(summary.buckets.map((b) => b.total)).toEqual(['400', '0', '0', '0', '0', '0', '601']);
  });

  it('covers the last 30 local days for month', async () => {
    const { deps, vendor } = setup();
    const summary = await vendorSummary(deps, vendor.id, 'month');
    expect(summary.from).toBe('2026-09-15T05:00:00.000Z');
    expect(summary.buckets).toHaveLength(30);
    expect(summary.buckets[29].start).toBe('2026-10-14T05:00:00.000Z');
  });

  it('gives zeros for a vendor with no sales', async () => {
    const { deps, vendor } = setup();
    const summary = await vendorSummary(deps, vendor.id, 'today');
    expect(summary).toMatchObject({
      paid: { count: 0, total: '0' },
      pending: { count: 0, total: '0' },
      failed: { count: 0 },
      averageTicket: '0',
    });
    expect(summary.buckets.every((b) => b.count === 0 && b.total === '0')).toBe(true);
  });

  it("covers one receiving wallet, the default unless walletId names another, in that wallet's asset", async () => {
    const { deps, repo, vendor, sale } = setup();
    const eur = repo.addVendorWallet(vendor.id, { walletAddress: TIENDA_EUR, assetCode: 'EUR' });
    sale(NOW.toISOString(), 'PAID', 1200n);
    repo.addSale({ vendorId: vendor.id, vendorWalletId: eur.id, status: 'PAID', amount: 900n, assetCode: 'EUR' });
    expect(await vendorSummary(deps, vendor.id, 'today')).toMatchObject({
      assetCode: 'USD',
      paid: { count: 1, total: '1200' },
    });
    expect(await vendorSummary(deps, vendor.id, 'today', eur.id)).toMatchObject({
      assetCode: 'EUR',
      paid: { count: 1, total: '900' },
    });
    const other = repo.addVendor({ name: 'Otra', wallet: { walletAddress: 'https://ilp.test/otra' } });
    await expect(vendorSummary(deps, vendor.id, 'today', other.wallet.id)).rejects.toMatchObject({
      status: 404,
      code: 'WALLET_NOT_FOUND',
    });
  });

  it('keeps 24 buckets across a 25-hour DST day', async () => {
    const { deps, vendor, sale } = setup({ timeZone: 'America/New_York', now: () => new Date('2026-11-01T16:00:00Z') });
    sale('2026-11-02T04:30:00.000Z', 'PAID'); // 23:30 EST on Nov 1
    const summary = await vendorSummary(deps, vendor.id, 'today');
    expect(summary).toMatchObject({ from: '2026-11-01T04:00:00.000Z', to: '2026-11-02T05:00:00.000Z', paid: { count: 1 } });
    expect(summary.buckets).toHaveLength(24);
    expect(summary.buckets[23]).toMatchObject({ start: '2026-11-02T04:00:00.000Z', count: 1 });
  });
});

describe('listVendorSales', () => {
  it('lists newest first with vendor and buyer names, leaving out AWAITING_TAP', async () => {
    const { deps, repo, vendor, sale } = setup();
    const old = sale('2026-10-13T15:00:00.000Z', 'PAID');
    const refused = repo.addSale({
      vendorId: vendor.id,
      status: 'FAILED',
      amount: 999n,
      failureCode: 'BUYER_UNKNOWN',
      failureMessage: 'Card not registered',
      createdAt: new Date('2026-10-14T14:00:00.000Z'),
    });
    const recent = sale('2026-10-14T15:00:00.000Z', 'CHARGING');
    sale('2026-10-14T16:00:00.000Z', 'AWAITING_TAP', 700n, null);

    const list = await listVendorSales(deps, vendor.id, { limit: 50 });
    expect(list.map((s) => s.id)).toEqual([recent.id, refused.id, old.id]);
    expect(list[0]).toMatchObject({ vendorName: 'Tienda', buyerName: 'Ana', status: 'CHARGING' });
    expect(list[1]).toEqual({
      id: refused.id,
      vendorId: vendor.id,
      vendorName: 'Tienda',
      vendorWalletId: vendor.wallet.id,
      buyerId: null,
      buyerWalletId: null,
      amount: '999',
      amountFormatted: '9.99',
      assetCode: 'USD',
      assetScale: 2,
      status: 'FAILED',
      debitAmount: null,
      debitAmountFormatted: null,
      debitAssetCode: null,
      debitAssetScale: null,
      failureCode: 'BUYER_UNKNOWN',
      failureMessage: 'Card not registered',
      description: null,
      chargedVia: null,
      createdAt: '2026-10-14T14:00:00.000Z',
      paidAt: null,
      buyerName: null,
    });
  });

  it("names each sale after its wallets' public names, else the registered names", async () => {
    const { deps, repo, vendor, ana, sale } = setup();
    const paid = sale('2026-10-14T15:00:00.000Z', 'PAID');
    const walletGone = repo.addSale({
      vendorId: vendor.id,
      buyerId: ana.id,
      buyerWalletId: null,
      status: 'PAID',
      createdAt: new Date('2026-10-14T14:00:00.000Z'),
    });
    repo.wallets.get(ana.wallet.id)!.publicName = 'Ana Pérez';
    repo.vendorWallets.get(vendor.wallet.id)!.publicName = 'Tienda La 14';
    const list = await listVendorSales(deps, vendor.id, { limit: 50 });
    expect(list.map((s) => [s.id, s.vendorName, s.buyerName])).toEqual([
      [paid.id, 'Tienda La 14', 'Ana Pérez'],
      [walletGone.id, 'Tienda La 14', 'Ana'],
    ]);
  });

  it("lists every receiving wallet's sales, each in its own asset, or one wallet's", async () => {
    const { deps, repo, vendor, sale } = setup();
    const eur = repo.addVendorWallet(vendor.id, { walletAddress: TIENDA_EUR, assetCode: 'EUR' });
    const usd = sale('2026-10-14T14:00:00.000Z', 'PAID');
    const inEur = repo.addSale({ vendorId: vendor.id, vendorWalletId: eur.id, status: 'PAID', assetCode: 'EUR' });
    const all = await listVendorSales(deps, vendor.id, { limit: 50 });
    expect(all.map((s) => [s.id, s.vendorWalletId, s.assetCode])).toEqual([
      [inEur.id, eur.id, 'EUR'],
      [usd.id, vendor.wallet.id, 'USD'],
    ]);
    const one = await listVendorSales(deps, vendor.id, { limit: 50, walletId: eur.id });
    expect(one.map((s) => s.id)).toEqual([inEur.id]);
    await expect(listVendorSales(deps, vendor.id, { limit: 50, walletId: 'vw-x' })).rejects.toMatchObject({
      code: 'WALLET_NOT_FOUND',
    });
  });

  it('filters by status, AWAITING_TAP only when asked', async () => {
    const { deps, vendor, sale } = setup();
    const paid = sale('2026-10-14T15:00:00.000Z', 'PAID');
    const waiting = sale('2026-10-14T16:00:00.000Z', 'AWAITING_TAP', 700n, null);
    expect((await listVendorSales(deps, vendor.id, { status: 'PAID', limit: 50 })).map((s) => s.id)).toEqual([paid.id]);
    expect((await listVendorSales(deps, vendor.id, { status: 'AWAITING_TAP', limit: 50 })).map((s) => s.id)).toEqual([
      waiting.id,
    ]);
  });

  it('filters by local calendar day, midnight to midnight', async () => {
    const { deps, vendor, sale } = setup();
    sale('2026-10-14T04:59:59.999Z', 'PAID'); // the 13th, local
    const first = sale('2026-10-14T05:00:00.000Z', 'PAID');
    const last = sale('2026-10-15T04:59:59.999Z', 'PAID');
    sale('2026-10-15T05:00:00.000Z', 'PAID'); // the 15th, local
    expect((await listVendorSales(deps, vendor.id, { date: '2026-10-14', limit: 50 })).map((s) => s.id)).toEqual([
      last.id,
      first.id,
    ]);
  });
});

describe('vendor wallets', () => {
  it('adds a receiving wallet from its live document, not as the default; the default repeats at the top', async () => {
    const { deps, op, vendor } = setup();
    op.script.wallets[TIENDA_EUR] = { assetCode: 'EUR', publicName: 'Tienda Euros' };
    const view = await addVendorWallet(deps, vendor.id, TIENDA_EUR);
    expect(view).toEqual({
      id: vendor.id,
      name: 'Tienda',
      defaultWalletId: vendor.wallet.id,
      walletAddress: VENDOR_WALLET,
      publicName: null,
      assetCode: 'USD',
      assetScale: 2,
      wallets: [
        { id: vendor.wallet.id, walletAddress: VENDOR_WALLET, publicName: null, assetCode: 'USD', assetScale: 2, isDefault: true },
        {
          id: expect.any(String),
          walletAddress: TIENDA_EUR,
          publicName: 'Tienda Euros',
          assetCode: 'EUR',
          assetScale: 2,
          isDefault: false,
        },
      ],
    });
    expect(op.calls).toEqual([`wallet:${TIENDA_EUR}`]);
  });

  it("makes a vendor's first wallet the default", async () => {
    const { deps, repo } = setup();
    repo.vendors.set('v0', { id: 'v0', name: 'Nueva', defaultWalletId: null, createdAt: NOW });
    const view = await addVendorWallet(deps, 'v0', TIENDA_EUR);
    expect(view).toMatchObject({
      defaultWalletId: view.wallets[0].id,
      walletAddress: TIENDA_EUR,
      wallets: [{ isDefault: true }],
    });
  });

  it('refuses a taken address, a bad URL and an unknown vendor before calling the wallet, then an unreachable one', async () => {
    const { deps, op, vendor } = setup();
    await expect(addVendorWallet(deps, vendor.id, VENDOR_WALLET)).rejects.toMatchObject({
      status: 409,
      code: 'WALLET_TAKEN',
      message: `Wallet ${VENDOR_WALLET} is already registered`,
    });
    await expect(addVendorWallet(deps, vendor.id, 'tienda')).rejects.toMatchObject({ status: 400, code: 'VALIDATION' });
    await expect(addVendorWallet(deps, 'nope', TIENDA_EUR)).rejects.toMatchObject({
      status: 404,
      code: 'VENDOR_NOT_FOUND',
    });
    expect(op.calls).toEqual([]);
    op.script.failOn.wallet = new WalletError('Could not find wallet address', 404);
    await expect(addVendorWallet(deps, vendor.id, TIENDA_EUR)).rejects.toMatchObject({
      status: 400,
      code: 'WALLET_UNREACHABLE',
      message: 'Could not find wallet address',
    });
  });

  it("takes a buyer's address: addresses are unique among vendor wallets only", async () => {
    const { deps, vendor } = setup();
    const view = await addVendorWallet(deps, vendor.id, 'https://ilp.test/ana');
    expect(view.wallets.map((w) => w.walletAddress)).toEqual([VENDOR_WALLET, 'https://ilp.test/ana']);
  });

  it('switches the default, which new sales receive into', async () => {
    const { deps, repo, vendor } = setup();
    const eur = repo.addVendorWallet(vendor.id, { walletAddress: TIENDA_EUR, assetCode: 'EUR' });
    const view = await setDefaultVendorWallet(deps, vendor.id, eur.id);
    expect(view).toMatchObject({
      defaultWalletId: eur.id,
      walletAddress: TIENDA_EUR,
      assetCode: 'EUR',
      wallets: [{ isDefault: false }, { isDefault: true }],
    });
    expect(await createSale(deps, vendor.id, '500')).toMatchObject({ vendorWalletId: eur.id, assetCode: 'EUR' });
    const other = repo.addVendor({ name: 'Otra', wallet: { walletAddress: 'https://ilp.test/otra' } });
    await expect(setDefaultVendorWallet(deps, vendor.id, other.wallet.id)).rejects.toMatchObject({
      status: 404,
      code: 'WALLET_NOT_FOUND',
      message: `Wallet ${other.wallet.id} not found for vendor ${vendor.id}`,
    });
  });

  it('removes a wallet: never the last one, the default passes to the oldest left, its sales keep the vendor', async () => {
    const { deps, repo, vendor, sale } = setup();
    const eur = repo.addVendorWallet(vendor.id, { walletAddress: TIENDA_EUR });
    const third = repo.addVendorWallet(vendor.id, { walletAddress: 'https://ilp.test/tienda-3' });
    const paid = sale(NOW.toISOString(), 'PAID');
    const view = await removeVendorWallet(deps, vendor.id, vendor.wallet.id);
    expect(view).toMatchObject({
      defaultWalletId: eur.id,
      wallets: [{ id: eur.id, isDefault: true }, { id: third.id, isDefault: false }],
    });
    expect(repo.sales.get(paid.id)).toMatchObject({ vendorId: vendor.id, vendorWalletId: null });

    await removeVendorWallet(deps, vendor.id, third.id);
    await expect(removeVendorWallet(deps, vendor.id, eur.id)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_WALLET',
      message: 'A vendor keeps at least one wallet',
    });
  });

  it("names a vendor after its default wallet's public name, else the registered one", async () => {
    const { deps, repo, vendor } = setup();
    expect((await listVendorViews(deps))[0]).toMatchObject({ name: 'Tienda', publicName: null });
    repo.vendorWallets.get(vendor.wallet.id)!.publicName = 'Tienda La 14';
    expect((await listVendorViews(deps))[0]).toMatchObject({
      name: 'Tienda La 14',
      publicName: 'Tienda La 14',
      wallets: [{ publicName: 'Tienda La 14' }],
    });
  });

  it('lists vendors with their wallets, leaving out one without wallets', async () => {
    const { deps, repo } = setup();
    repo.vendors.set('v0', { id: 'v0', name: 'Nueva', defaultWalletId: null, createdAt: NOW });
    expect((await listVendorViews(deps)).map((v) => [v.name, v.wallets.length])).toEqual([['Tienda', 1]]);
  });

  it('findVendor, for add:wallet, matches an id, an exact name or any wallet address', async () => {
    const { repo, vendor } = setup();
    repo.addVendorWallet(vendor.id, { walletAddress: TIENDA_EUR });
    const vendors = await repo.listVendors();
    for (const key of [vendor.id, 'Tienda', TIENDA_EUR]) expect(findVendor(vendors, key).id).toBe(vendor.id);
    expect(() => findVendor(vendors, 'tienda')).toThrow(
      'Vendor "tienda" not found (match is exact: id, name or wallet address)',
    );
  });
});

describe('vendor dashboard over HTTP', () => {
  it('defaults the summary to today and lists sales', async () => {
    const { app, vendor, sale } = setup();
    sale(NOW.toISOString(), 'PAID', 1200n);
    const summary = await request(app).get(`/vendors/${vendor.id}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ range: 'today', paid: { count: 1, total: '1200' }, averageTicket: '1200' });
    expect(summary.body.data.buckets).toHaveLength(24);
    const week = await request(app).get(`/vendors/${vendor.id}/summary?range=week`);
    expect(week.body.data.buckets).toHaveLength(7);
    const sales = await request(app).get(`/vendors/${vendor.id}/sales?status=PAID&date=2026-10-14`);
    expect(sales.status).toBe(200);
    expect(sales.body.data).toEqual([expect.objectContaining({ amount: '1200', vendorName: 'Tienda', buyerName: 'Ana' })]);
  });

  it('adds, defaults and removes receiving wallets, and scopes the dashboard to one', async () => {
    const { app, op, vendor, sale } = setup();
    op.script.wallets[TIENDA_EUR] = { assetCode: 'EUR' };
    const added = await request(app).post(`/vendors/${vendor.id}/wallets`).send({ walletAddress: TIENDA_EUR });
    expect(added.status).toBe(201);
    const eurId = added.body.data.wallets[1].id;
    sale(NOW.toISOString(), 'PAID', 1200n);
    const created = await request(app).post('/sales').send({ vendorId: vendor.id, amount: '900', walletId: eurId });
    expect(created.body.data).toMatchObject({ vendorWalletId: eurId, assetCode: 'EUR' });

    const usd = await request(app).get(`/vendors/${vendor.id}/summary`);
    expect(usd.body.data).toMatchObject({ assetCode: 'USD', paid: { count: 1, total: '1200' } });
    const eur = await request(app).get(`/vendors/${vendor.id}/summary?walletId=${eurId}`);
    expect(eur.body.data).toMatchObject({ assetCode: 'EUR', paid: { count: 0 } });
    const waiting = await request(app).get(`/vendors/${vendor.id}/sales?status=AWAITING_TAP&walletId=${eurId}`);
    expect(waiting.body.data).toEqual([expect.objectContaining({ amount: '900', assetCode: 'EUR' })]);

    const switched = await request(app).put(`/vendors/${vendor.id}/default-wallet`).send({ walletId: eurId });
    expect(switched.body.data).toMatchObject({ defaultWalletId: eurId, assetCode: 'EUR' });
    const removed = await request(app).delete(`/vendors/${vendor.id}/wallets/${eurId}`);
    expect(removed.body.data).toMatchObject({ defaultWalletId: vendor.wallet.id, wallets: [{ id: vendor.wallet.id }] });
    const last = await request(app).delete(`/vendors/${vendor.id}/wallets/${vendor.wallet.id}`);
    expect([last.status, last.body.error.code]).toEqual([409, 'LAST_WALLET']);
  });

  it('names the vendor wallet errors', async () => {
    const { app, op, vendor } = setup();
    const post = (id: string, body: object) => request(app).post(`/vendors/${id}/wallets`).send(body);
    expect((await post(vendor.id, { walletAddress: VENDOR_WALLET })).body.error.code).toBe('WALLET_TAKEN');
    expect((await post(vendor.id, { walletAddress: 'nope' })).body.error).toEqual({
      code: 'VALIDATION',
      message: 'walletAddress: Invalid URL',
    });
    expect((await post('nope', { walletAddress: TIENDA_EUR })).body.error.code).toBe('VENDOR_NOT_FOUND');
    op.script.failOn.wallet = new WalletError('Could not find wallet address', 404);
    const unreachable = await post(vendor.id, { walletAddress: TIENDA_EUR });
    expect([unreachable.status, unreachable.body.error.code]).toEqual([400, 'WALLET_UNREACHABLE']);

    const foreign = [
      await request(app).put(`/vendors/${vendor.id}/default-wallet`).send({ walletId: 'vw-x' }),
      await request(app).get(`/vendors/${vendor.id}/summary?walletId=vw-x`),
      await request(app).get(`/vendors/${vendor.id}/sales?walletId=vw-x`),
      await request(app).post('/sales').send({ vendorId: vendor.id, amount: '1', walletId: 'vw-x' }),
    ];
    for (const res of foreign) {
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: 'WALLET_NOT_FOUND', message: `Wallet vw-x not found for vendor ${vendor.id}` });
    }
  });

  it('defaults the limit to 50 and caps it at 200', async () => {
    const { app, vendor, sale } = setup();
    for (let i = 0; i < 205; i++) sale(new Date(NOW.getTime() - i * 1000).toISOString(), 'PAID');
    expect((await request(app).get(`/vendors/${vendor.id}/sales`)).body.data).toHaveLength(50);
    expect((await request(app).get(`/vendors/${vendor.id}/sales?limit=500`)).body.data).toHaveLength(200);
    const three = (await request(app).get(`/vendors/${vendor.id}/sales?limit=3`)).body.data;
    expect(three.map((s: { createdAt: string }) => s.createdAt)).toEqual(
      [0, 1, 2].map((i) => new Date(NOW.getTime() - i * 1000).toISOString()),
    );
  });

  it('rejects bad parameters with 400 and unknown vendors with 404', async () => {
    const { app, vendor } = setup();
    const bad = [
      `/vendors/${vendor.id}/summary?range=year`,
      `/vendors/${vendor.id}/sales?status=NOPE`,
      `/vendors/${vendor.id}/sales?date=2026-13-01`,
      `/vendors/${vendor.id}/sales?date=2026-02-30`,
      `/vendors/${vendor.id}/sales?date=14-10-2026`,
      `/vendors/${vendor.id}/sales?limit=0`,
      `/vendors/${vendor.id}/sales?limit=abc`,
      `/vendors/${vendor.id}/sales?limit=1.5`,
    ];
    for (const url of bad) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error.code, url).toBe('VALIDATION');
    }
    for (const url of ['/vendors/nope/summary', '/vendors/nope/sales']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error).toEqual({ code: 'VENDOR_NOT_FOUND', message: 'Vendor nope not found' });
    }
  });
});
