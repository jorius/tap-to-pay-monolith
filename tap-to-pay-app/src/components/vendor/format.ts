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

// Grey for a refused or failed sale: it moved no money (Paynela design system).
export const STATUS_TONE: Record<SaleStatus, 'ok' | 'bad' | 'wait' | 'neutral'> = {
  PAID: 'ok',
  FAILED: 'neutral',
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

// The service words refusals in English (SDD §9): the copy reuses the amount inside them, and falls back to the
// service's message whenever the code is unknown or the message does not carry an amount.
export function failureText(
  sale: Pick<SaleView, 'failureCode' | 'failureMessage' | 'assetCode' | 'debitAssetCode'>,
  templates: Record<string, string>,
  lang: Lang,
) {
  const message = sale.failureMessage ?? '';
  const template = sale.failureCode ? templates[sale.failureCode] : undefined;
  if (!template) return message;
  const number = message.match(/\d+(?:\.\d+)?/)?.[0];
  if (template.includes('{amount}') && !number) return message;
  // Caps live in the buyer's asset, which the service names after the amount ("max 20.00 USD").
  const code = message.match(/\b[A-Z]{3}\b/)?.[0] ?? sale.debitAssetCode ?? sale.assetCode;
  const amount = number ? formatMoney(number.replace('.', ''), number.split('.')[1]?.length ?? 0, code, lang) : '';
  return fill(template, { amount, message });
}

export function errorText(error: ApiError, networkTemplate: string) {
  return error.code === 'NETWORK' ? fill(networkTemplate, { url: apiUrl }) : `${error.code}: ${error.message}`;
}

// shortcut: only the Interledger Test Wallet has a known web page, other providers open their wallet host.
export function walletSite(walletAddress: string) {
  const host = walletAddress.match(/^https?:\/\/([^/]+)/)?.[1] ?? '';
  return host === 'ilp.interledger-test.dev' ? 'https://wallet.interledger-test.dev' : `https://${host}`;
}

// The path of a wallet address, enough to tell a vendor's wallets apart: "https://ilp.example/tourism" → "/tourism".
export function addressPath(walletAddress: string) {
  return walletAddress.replace(/^https?:\/\/[^/]+/, '') || walletAddress;
}

export function providerName(walletAddress: string) {
  const host = walletAddress.match(/^https?:\/\/([^/]+)/)?.[1] ?? walletAddress;
  return host === 'ilp.interledger-test.dev' ? 'Interledger Test Wallet' : host;
}

// "pesos", "dólares": the currency as a vendor says it (design: Más, Dónde recibo la plata); other assets keep their code.
const CURRENCY: Record<string, Record<Lang, string>> = {
  COP: { es: 'pesos', en: 'pesos' },
  USD: { es: 'dólares', en: 'dollars' },
  EUR: { es: 'euros', en: 'euros' },
  MXN: { es: 'pesos mexicanos', en: 'Mexican pesos' },
};

export const currencyName = (assetCode: string, lang: Lang) => CURRENCY[assetCode]?.[lang] ?? assetCode;
