import { describe, expect, it } from 'vitest';
import { saleView } from '../src/services/views.js';
import { FakeRepo } from './fakes.js';

describe('saleView', () => {
  it('turns bigints into strings and formats the amount', () => {
    const repo = new FakeRepo();
    const sale = repo.addSale({ vendorId: 'v1', amount: 1200n, incomingPaymentUrl: 'https://secret' });
    const view = saleView(sale);
    expect(view).toMatchObject({
      amount: '1200',
      amountFormatted: '12.00',
      createdAt: '2026-10-14T15:00:00.000Z',
      paidAt: null,
    });
    expect(view).not.toHaveProperty('vendorName');
    expect(view).not.toHaveProperty('incomingPaymentUrl');
    expect(saleView(sale, 'Tienda').vendorName).toBe('Tienda');
  });
});
