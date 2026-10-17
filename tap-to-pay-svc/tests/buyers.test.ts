import { describe, expect, it } from 'vitest';
import { WalletError } from '../src/open-payments/types.js';
import {
  addBuyer,
  addWallet,
  findBuyer,
  getBuyer,
  grantTarget,
  listBuyerSales,
  listBuyerViews,
  removeWallet,
  setDefaultWallet,
  updateLimits,
  updateWalletLimits,
} from '../src/services/buyers.js';
import { BUYER_WALLET, makeDeps, NOW } from './fakes.js';

const SAVINGS = 'https://ilp.test/ana-ahorros';
const MARTA_WALLET = 'https://ilp.test/marta';

function setup() {
  const ctx = makeDeps();
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  return { ...ctx, buyer, vendor };
}

/** Ana with a second, EUR wallet that has no grant yet. */
function twoWallets() {
  const ctx = setup();
  const savings = ctx.repo.addBuyerWallet(ctx.buyer.id, {
    walletAddress: SAVINGS,
    assetCode: 'EUR',
    perPaymentLimit: 1000n,
    dailyLimit: 3000n,
    grantAccessToken: null,
    grantManageUrl: null,
  });
  return { ...ctx, savings };
}

describe('buyers', () => {
  it("reports today's totals", async () => {
    const ctx = setup();
    ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 1200n });
    ctx.repo.addSale({
      vendorId: ctx.vendor.id,
      buyerId: ctx.buyer.id,
      status: 'PAID',
      amount: 999n,
      createdAt: new Date('2026-10-13T15:00:00Z'),
    });
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({
      spentToday: '1200',
      remainingToday: '3800',
      hasGrant: true,
    });
    expect(await listBuyerViews(ctx.deps)).toHaveLength(1);
  });

  it("reports what the wallet's grant authorized and what is left of it today", async () => {
    const ctx = setup();
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({ grantDailyLimit: null, grantRemainingToday: null });
    ctx.repo.wallets.get(ctx.buyer.wallet.id)!.grantDailyLimit = 3000n;
    ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 1200n });
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({ grantDailyLimit: '3000', grantRemainingToday: '1800' });
    ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID', amount: 2500n });
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({ grantRemainingToday: '0' });
  });

  it('adds a new buyer with its first, default wallet from the live document, keeping caps and grant on re-run', async () => {
    const ctx = setup();
    const url = 'https://ilp.test/luis-eur';
    ctx.op.script.wallets[url] = { assetCode: 'EUR', assetScale: 2 };
    const input = { name: ' Luis ', walletAddress: url, perPaymentLimit: '1500', dailyLimit: '4000' };
    const added = await addBuyer(ctx.deps, input);
    const [wallet] = added.wallets;
    expect(added).toMatchObject({ name: 'Luis', defaultWalletId: wallet.id });
    expect(wallet).toMatchObject({
      walletAddress: url,
      assetCode: 'EUR',
      perPaymentLimit: 1500n,
      dailyLimit: 4000n,
      grantAccessToken: null,
    });
    expect(ctx.op.calls).toEqual([`wallet:${url}`]);
    ctx.repo.wallets.get(wallet.id)!.grantAccessToken = 'token-eur';
    const again = await addBuyer(ctx.deps, { ...input, name: 'Luis Euros', dailyLimit: '9000' });
    expect(again).toMatchObject({
      id: added.id,
      name: 'Luis Euros',
      wallets: [{ id: wallet.id, dailyLimit: 4000n, grantAccessToken: 'token-eur' }],
    });
    expect(ctx.repo.buyers.size).toBe(2);
    expect(ctx.repo.wallets.size).toBe(2);
  });

  it('validates a new buyer before calling the wallet', async () => {
    const ctx = setup();
    const ok = { name: 'Ana', walletAddress: 'https://ilp.test/x', perPaymentLimit: '1', dailyLimit: '5' };
    await expect(addBuyer(ctx.deps, { ...ok, name: ' ' })).rejects.toMatchObject({ status: 400, message: 'name is required' });
    await expect(addBuyer(ctx.deps, { ...ok, walletAddress: 'ana' })).rejects.toMatchObject({ status: 400 });
    await expect(addBuyer(ctx.deps, { ...ok, perPaymentLimit: '9' })).rejects.toMatchObject({
      message: 'perPaymentLimit must be ≤ dailyLimit',
    });
    expect(ctx.op.calls).toEqual([]);
  });

  it('never returns a token', async () => {
    const ctx = twoWallets();
    ctx.repo.wallets.get(ctx.savings.id)!.grantAccessToken = 'token-2';
    expect(JSON.stringify(await getBuyer(ctx.deps, ctx.buyer.id))).not.toMatch(/token-|auth\.test/);
  });

  it('updates limits', async () => {
    const ctx = setup();
    const view = await updateLimits(ctx.deps, ctx.buyer.id, { perPaymentLimit: '3000', dailyLimit: '9000' });
    expect(view).toMatchObject({ perPaymentLimit: '3000', dailyLimit: '9000' });
  });

  it('validates limits', async () => {
    const ctx = setup();
    await expect(
      updateLimits(ctx.deps, ctx.buyer.id, { perPaymentLimit: '6000', dailyLimit: '5000' }),
    ).rejects.toMatchObject({ status: 400, message: 'perPaymentLimit must be ≤ dailyLimit' });
    await expect(
      updateLimits(ctx.deps, ctx.buyer.id, { perPaymentLimit: '1.5', dailyLimit: '5000' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateLimits(ctx.deps, 'nope', { perPaymentLimit: '1', dailyLimit: '5' }),
    ).rejects.toMatchObject({ status: 404, code: 'BUYER_NOT_FOUND', message: 'Buyer nope not found' });
  });

  it('lists history newest first with vendor names', async () => {
    const ctx = setup();
    const base = { vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID' as const };
    ctx.repo.addSale({ ...base, amount: 100n, createdAt: new Date('2026-10-14T13:00:00Z') });
    ctx.repo.addSale({ ...base, amount: 200n, createdAt: new Date('2026-10-14T14:00:00Z') });
    ctx.repo.addSale({ vendorId: ctx.vendor.id, status: 'FAILED', amount: 300n }); // rule refusal: no buyer
    const history = await listBuyerSales(ctx.deps, ctx.buyer.id);
    expect(history.remainingToday).toBe('4700');
    expect(history.sales.map((s) => s.amount)).toEqual(['200', '100']);
    expect(history.sales[0].vendorName).toBe('Tienda');
  });
});

describe('public names', () => {
  it("names a buyer after the default wallet's public name, else the registered one; each wallet shows its own", async () => {
    const ctx = twoWallets();
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({ name: 'Ana', publicName: null });
    ctx.repo.wallets.get(ctx.buyer.wallet.id)!.publicName = 'Ana Pérez';
    ctx.repo.wallets.get(ctx.savings.id)!.publicName = 'Ahorros de Ana';
    expect(await getBuyer(ctx.deps, ctx.buyer.id)).toMatchObject({
      name: 'Ana Pérez',
      publicName: 'Ana Pérez',
      wallets: [{ publicName: 'Ana Pérez' }, { publicName: 'Ahorros de Ana' }],
    });
    expect((await setDefaultWallet(ctx.deps, ctx.buyer.id, ctx.savings.id)).name).toBe('Ahorros de Ana');
  });

  it('stores the public name of the live document when a buyer or a wallet is added, and again on re-run', async () => {
    const ctx = setup();
    ctx.op.script.wallets[SAVINGS] = { publicName: 'Ahorros de Ana' };
    const added = await addWallet(ctx.deps, ctx.buyer.id, { walletAddress: SAVINGS });
    expect(added.wallets[1].publicName).toBe('Ahorros de Ana');
    const input = { name: 'Luis', walletAddress: 'https://ilp.test/luis', perPaymentLimit: '1', dailyLimit: '5' };
    ctx.op.script.wallets[input.walletAddress] = { publicName: 'Luis Gómez' };
    expect((await addBuyer(ctx.deps, input)).wallets[0].publicName).toBe('Luis Gómez');
    ctx.op.script.wallets[input.walletAddress] = { publicName: 'Luis G.' };
    expect((await addBuyer(ctx.deps, input)).wallets[0].publicName).toBe('Luis G.');
  });

  it("names each sale's vendor after its receiving wallet's public name, else the vendor's registered name", async () => {
    const ctx = setup();
    const base = { vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID' as const };
    const received = ctx.repo.addSale({ ...base, createdAt: new Date('2026-10-14T13:00:00Z') });
    const walletGone = ctx.repo.addSale({ ...base, vendorWalletId: null, createdAt: new Date('2026-10-14T14:00:00Z') });
    ctx.repo.vendorWallets.get(ctx.vendor.wallet.id)!.publicName = 'Tienda La 14';
    const { sales } = await listBuyerSales(ctx.deps, ctx.buyer.id);
    expect(sales.map((s) => [s.id, s.vendorName])).toEqual([
      [walletGone.id, 'Tienda'],
      [received.id, 'Tienda La 14'],
    ]);
  });
});

describe('a buyer with several wallets', () => {
  it('lists every wallet in creation order, with the default one also at the top level', async () => {
    const ctx = twoWallets();
    const base = { vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID' as const };
    ctx.repo.addSale({ ...base, amount: 1200n });
    ctx.repo.addSale({ ...base, buyerWalletId: ctx.savings.id, amount: 500n });
    const view = await getBuyer(ctx.deps, ctx.buyer.id);
    expect(view).toMatchObject({
      id: ctx.buyer.id,
      name: 'Ana',
      defaultWalletId: ctx.buyer.wallet.id,
      walletAddress: BUYER_WALLET,
      spentToday: '1200',
      hasGrant: true,
      wallets: [
        { id: ctx.buyer.wallet.id, isDefault: true, spentToday: '1200', remainingToday: '3800' },
        {
          id: ctx.savings.id,
          isDefault: false,
          walletAddress: SAVINGS,
          assetCode: 'EUR',
          spentToday: '500',
          remainingToday: '2500',
          hasGrant: false,
        },
      ],
    });
    expect(view).not.toHaveProperty('isDefault');

    const switched = await setDefaultWallet(ctx.deps, ctx.buyer.id, ctx.savings.id);
    expect(switched).toMatchObject({
      defaultWalletId: ctx.savings.id,
      walletAddress: SAVINGS,
      spentToday: '500',
      hasGrant: false,
      wallets: [{ isDefault: false }, { isDefault: true }],
    });
  });

  it('adds a wallet from its live document, with the configured caps, without a grant and not as the default', async () => {
    const ctx = setup();
    ctx.deps.defaultLimits = { perPaymentLimit: 700n, dailyLimit: 900n };
    ctx.op.script.wallets[SAVINGS] = { assetCode: 'EUR', assetScale: 2 };
    const view = await addWallet(ctx.deps, ctx.buyer.id, { walletAddress: SAVINGS });
    expect(view.defaultWalletId).toBe(ctx.buyer.wallet.id);
    expect(view.wallets).toHaveLength(2);
    expect(view.wallets[1]).toMatchObject({
      walletAddress: SAVINGS,
      assetCode: 'EUR',
      perPaymentLimit: '700',
      dailyLimit: '900',
      hasGrant: false,
      isDefault: false,
    });
    expect(ctx.op.calls).toEqual([`wallet:${SAVINGS}`]);

    const capped = await addWallet(ctx.deps, ctx.buyer.id, {
      walletAddress: 'https://ilp.test/ana-3',
      perPaymentLimit: '100',
      dailyLimit: '300',
    });
    expect(capped.wallets[2]).toMatchObject({ perPaymentLimit: '100', dailyLimit: '300' });
  });

  it("makes a buyer's first wallet the default", async () => {
    const ctx = makeDeps();
    ctx.repo.buyers.set('b0', { id: 'b0', name: 'Luis', defaultWalletId: null, createdAt: NOW });
    const view = await addWallet(ctx.deps, 'b0', { walletAddress: SAVINGS });
    expect(view).toMatchObject({
      defaultWalletId: view.wallets[0].id,
      walletAddress: SAVINGS,
      wallets: [{ isDefault: true }],
    });
  });

  it('refuses a taken address, a bad URL and an unknown buyer before calling the wallet, then an unreachable one', async () => {
    const ctx = setup();
    const marta = ctx.repo.addBuyer({ name: 'Marta', wallet: { walletAddress: MARTA_WALLET } });
    await expect(addWallet(ctx.deps, ctx.buyer.id, { walletAddress: MARTA_WALLET })).rejects.toMatchObject({
      status: 409,
      code: 'WALLET_TAKEN',
      message: `Wallet ${MARTA_WALLET} is already registered`,
    });
    await expect(addWallet(ctx.deps, marta.id, { walletAddress: BUYER_WALLET })).rejects.toMatchObject({
      code: 'WALLET_TAKEN',
    });
    await expect(addWallet(ctx.deps, ctx.buyer.id, { walletAddress: 'ana' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION',
    });
    await expect(addWallet(ctx.deps, 'nope', { walletAddress: SAVINGS })).rejects.toMatchObject({
      status: 404,
      code: 'BUYER_NOT_FOUND',
    });
    expect(ctx.op.calls).toEqual([]);

    ctx.op.script.failOn.wallet = new WalletError('Could not find wallet address', 404);
    await expect(addWallet(ctx.deps, ctx.buyer.id, { walletAddress: SAVINGS })).rejects.toMatchObject({
      status: 400,
      code: 'WALLET_UNREACHABLE',
      message: 'Could not find wallet address',
    });
    expect(ctx.repo.wallets.size).toBe(2);
  });

  it("changes one wallet's caps, and PATCH /limits the default's", async () => {
    const ctx = twoWallets();
    const view = await updateWalletLimits(ctx.deps, ctx.buyer.id, ctx.savings.id, {
      perPaymentLimit: '1500',
      dailyLimit: '6000',
    });
    expect(view.wallets.map((w) => w.dailyLimit)).toEqual(['5000', '6000']);
    expect(view.dailyLimit).toBe('5000');
    const viaDefault = await updateLimits(ctx.deps, ctx.buyer.id, { perPaymentLimit: '3000', dailyLimit: '9000' });
    expect(viaDefault.wallets.map((w) => w.dailyLimit)).toEqual(['9000', '6000']);
  });

  it("refuses another buyer's wallet with WALLET_NOT_FOUND", async () => {
    const ctx = setup();
    const marta = ctx.repo.addBuyer({ name: 'Marta', wallet: { walletAddress: MARTA_WALLET } });
    const notFound = {
      status: 404,
      code: 'WALLET_NOT_FOUND',
      message: `Wallet ${marta.wallet.id} not found for buyer ${ctx.buyer.id}`,
    };
    const limits = { perPaymentLimit: '1', dailyLimit: '2' };
    await expect(setDefaultWallet(ctx.deps, ctx.buyer.id, marta.wallet.id)).rejects.toMatchObject(notFound);
    await expect(updateWalletLimits(ctx.deps, ctx.buyer.id, marta.wallet.id, limits)).rejects.toMatchObject(notFound);
    await expect(removeWallet(ctx.deps, ctx.buyer.id, marta.wallet.id)).rejects.toMatchObject(notFound);
    await expect(listBuyerSales(ctx.deps, ctx.buyer.id, marta.wallet.id)).rejects.toMatchObject(notFound);
  });

  it('removes a wallet: never the last one, the default passes to the oldest left, its sales keep the buyer', async () => {
    const ctx = twoWallets();
    const third = ctx.repo.addBuyerWallet(ctx.buyer.id, { walletAddress: 'https://ilp.test/ana-3' });
    const sale = ctx.repo.addSale({ vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID' });
    const view = await removeWallet(ctx.deps, ctx.buyer.id, ctx.buyer.wallet.id);
    expect(view).toMatchObject({
      defaultWalletId: ctx.savings.id,
      wallets: [{ id: ctx.savings.id, isDefault: true }, { id: third.id, isDefault: false }],
    });
    expect(ctx.repo.sales.get(sale.id)).toMatchObject({ buyerId: ctx.buyer.id, buyerWalletId: null });

    await removeWallet(ctx.deps, ctx.buyer.id, third.id);
    await expect(removeWallet(ctx.deps, ctx.buyer.id, ctx.savings.id)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_WALLET',
      message: 'A buyer keeps at least one wallet',
    });
  });

  it("lists one wallet's history with that wallet's remainingToday, or every wallet's with the default's", async () => {
    const ctx = twoWallets();
    const base = { vendorId: ctx.vendor.id, buyerId: ctx.buyer.id, status: 'PAID' as const };
    ctx.repo.addSale({ ...base, amount: 100n });
    ctx.repo.addSale({ ...base, buyerWalletId: ctx.savings.id, amount: 200n });
    const all = await listBuyerSales(ctx.deps, ctx.buyer.id);
    expect(all.sales.map((s) => s.amount)).toEqual(['200', '100']);
    expect(all.remainingToday).toBe('4900');
    const savings = await listBuyerSales(ctx.deps, ctx.buyer.id, ctx.savings.id);
    expect(savings.sales.map((s) => s.buyerWalletId)).toEqual([ctx.savings.id]);
    expect(savings.remainingToday).toBe('2800');
  });

  it('leaves a buyer without wallets out of the list', async () => {
    const ctx = setup();
    ctx.repo.buyers.set('b0', { id: 'b0', name: 'Luis', defaultWalletId: null, createdAt: NOW });
    expect((await listBuyerViews(ctx.deps)).map((b) => b.name)).toEqual(['Ana']);
  });
});

describe('findBuyer and grantTarget, for the scripts', () => {
  it('match an id, an exact name or any wallet address (then that wallet too)', async () => {
    const ctx = twoWallets();
    const buyers = await ctx.repo.listBuyers();
    expect(findBuyer(buyers, ctx.buyer.id).buyer.id).toBe(ctx.buyer.id);
    expect(findBuyer(buyers, 'Ana')).toEqual({ buyer: expect.objectContaining({ id: ctx.buyer.id }) });
    expect(findBuyer(buyers, SAVINGS)).toMatchObject({ buyer: { id: ctx.buyer.id }, wallet: { id: ctx.savings.id } });
    expect(() => findBuyer(buyers, 'ana')).toThrow('Buyer "ana" not found (match is exact: id, name or wallet address)');
  });

  it("grant --wallet, else the wallet --buyer named, else the buyer's default", async () => {
    const ctx = twoWallets();
    ctx.repo.addBuyer({ name: 'Marta', wallet: { walletAddress: MARTA_WALLET } });
    const buyers = await ctx.repo.listBuyers();
    expect(grantTarget(buyers, { buyer: 'Ana' }).wallet.id).toBe(ctx.buyer.wallet.id);
    expect(grantTarget(buyers, { buyer: SAVINGS }).wallet.id).toBe(ctx.savings.id);
    expect(grantTarget(buyers, { buyer: 'Ana', wallet: SAVINGS }).wallet.id).toBe(ctx.savings.id);
    expect(() => grantTarget(buyers, { buyer: 'Ana', wallet: MARTA_WALLET })).toThrow(
      `${MARTA_WALLET} is not a wallet of Ana`,
    );
  });
});
