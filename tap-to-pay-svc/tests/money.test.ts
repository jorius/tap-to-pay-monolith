import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/services/errors.js';
import { amountToBigInt, formatAmount, parseAmount, toAmount } from '../src/services/money.js';

describe('parseAmount', () => {
  it('accepts digit strings', () => {
    expect(parseAmount('1200')).toBe(1200n);
    expect(parseAmount('007')).toBe(7n);
  });

  it.each(['', '12.50', '-5', '1e3', ' 12'])('rejects %j', (input) => {
    expect(() => parseAmount(input)).toThrow(HttpError);
  });

  it('names the bad input', () => {
    expect(() => parseAmount('12.50')).toThrow('amount must be digits in the smallest unit, got "12.50"');
  });

  it('rejects zero', () => {
    expect(() => parseAmount('0')).toThrow('amount must be greater than zero');
  });
});

describe('formatAmount', () => {
  it('formats by scale', () => {
    expect(formatAmount(1200n, 0)).toBe('1200');
    expect(formatAmount(1200n, 2)).toBe('12.00');
    expect(formatAmount(5n, 2)).toBe('0.05');
    expect(formatAmount(1234n, 3)).toBe('1.234');
    expect(formatAmount(5n, 3)).toBe('0.005');
  });
});

describe('toAmount and amountToBigInt', () => {
  it('round-trip', () => {
    const amount = toAmount(1200n, 'USD', 2);
    expect(amount).toEqual({ value: '1200', assetCode: 'USD', assetScale: 2 });
    expect(amountToBigInt(amount)).toBe(1200n);
  });
});
