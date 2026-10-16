import { apiUrl, type ApiError } from '@/api/client';
import { formatMoney } from '@/api/money';
import type { SaleStatus, SaleView } from '@/api/types';
import type { Lang } from '@/i18n';

export const locale = (lang: Lang) => (lang === 'es' ? 'es-CO' : 'en-US');

export function time(iso: string, lang: Lang, withSeconds = false) {
  return new Date(iso).toLocaleTimeString(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  });
}

export const STATUS_TONE: Record<SaleStatus, 'ok' | 'bad' | 'wait' | 'neutral'> = {
  PAID: 'ok',
  FAILED: 'bad',
  CHARGING: 'wait',
  AWAITING_TAP: 'neutral',
};

const MAX_DIGITS = 9;

// Keypad input: typing 1 2 0 0 builds "1200", the smallest unit the service expects (design: Terminal, SDD §8).
export function nextDigits(digits: string, key: string) {
  if (key === 'del') return digits.slice(0, -1) || '0';
  const next = (digits + key).replace(/^0+(?=\d)/, '');
  return next.length <= MAX_DIGITS ? next : digits;
}

export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

// The service words refusals in English (SDD §9): the copy reuses the amount or the currency codes inside them, and
// falls back to the service's message whenever the code is unknown or the message does not carry what it needs.
export function failureText(
  sale: Pick<SaleView, 'failureCode' | 'failureMessage' | 'assetCode'>,
  templates: Record<string, string>,
  lang: Lang,
) {
  const message = sale.failureMessage ?? '';
  const template = sale.failureCode ? templates[sale.failureCode] : undefined;
  if (!template) return message;
  const number = message.match(/\d+(?:\.\d+)?/)?.[0];
  const codes = message.match(/[A-Z]{3}/g) ?? [];
  if (template.includes('{amount}') && !number) return message;
  if (template.includes('{buyer}') && codes.length < 2) return message;
  const amount = number
    ? formatMoney(number.replace('.', ''), number.split('.')[1]?.length ?? 0, sale.assetCode, lang)
    : '';
  return fill(template, { amount, buyer: codes[0] ?? '', vendor: codes[1] ?? '', message });
}

export function errorText(error: ApiError, networkTemplate: string) {
  return error.code === 'NETWORK' ? fill(networkTemplate, { url: apiUrl }) : `${error.code}: ${error.message}`;
}

// shortcut: only the Interledger Test Wallet has a known web page, other providers open their wallet host.
export function walletSite(walletAddress: string) {
  const host = walletAddress.match(/^https?:\/\/([^/]+)/)?.[1] ?? '';
  return host === 'ilp.interledger-test.dev' ? 'https://wallet.interledger-test.dev' : `https://${host}`;
}

export function providerName(walletAddress: string) {
  const host = walletAddress.match(/^https?:\/\/([^/]+)/)?.[1] ?? walletAddress;
  return host === 'ilp.interledger-test.dev' ? 'Interledger Test Wallet' : host;
}
