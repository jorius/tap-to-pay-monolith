import { describe, expect, it } from 'vitest';
import { getBuyer, listBuyerSales, listBuyerViews, updateLimits } from '../src/services/buyers.js';
import { makeDeps } from './fakes.js';

function setup() {
  const ctx = makeDeps();
  const buyer = ctx.repo.addBuyer();
  const vendor = ctx.repo.addVendor();
  return { ...ctx, buyer, vendor };
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

  it('never returns the token', async () => {
    const ctx = setup();
    expect(JSON.stringify(await getBuyer(ctx.deps, ctx.buyer.id))).not.toContain('token-1');
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
