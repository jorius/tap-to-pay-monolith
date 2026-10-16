import { validation } from './errors.js';

// Amounts are integers in the wallet's smallest unit: bigint in code, digit strings in JSON.

export type Amount = { value: string; assetCode: string; assetScale: number };

export function parseAmount(input: string, field = 'amount'): bigint {
  if (!/^\d+$/.test(input)) {
    throw validation(`${field} must be digits in the smallest unit, got ${JSON.stringify(input)}`);
  }
  const value = BigInt(input);
  if (value <= 0n) throw validation(`${field} must be greater than zero`);
  return value;
}

export function formatAmount(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  if (scale <= 0) return (negative ? '-' : '') + digits;
  const padded = digits.padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function toAmount(value: bigint, assetCode: string, assetScale: number): Amount {
  return { value: value.toString(), assetCode, assetScale };
}

export function amountToBigInt(amount: { value: string }): bigint {
  return BigInt(amount.value);
}
