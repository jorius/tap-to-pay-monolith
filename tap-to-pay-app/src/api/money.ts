import type { SaleView } from '@/api/types';
import type { Lang } from '@/i18n';

// Amounts are digit strings in the asset's smallest unit (SDD section 8): "1200" at scale 2 is "12.00". No floats.
export function formatAmount(amount: string, scale: number) {
  const digits = amount.replace(/^0+(?=\d)/, '').padStart(scale + 1, '0');
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

// Whole units typed on a keypad to the smallest unit the service expects: "12" at scale 2 is "1200".
export const toMinor = (units: string, scale: number) => `${units}${'0'.repeat(scale)}`;

// Grouped digits with every decimal, for entry fields: "1.234,50" (es) or "1,234.50" (en).
export function formatDigits(amount: string, scale: number, lang: Lang) {
  const [int, frac] = formatAmount(amount, scale).split('.');
  const [group, decimal] = lang === 'es' ? ['.', ','] : [',', '.'];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return frac === undefined ? grouped : grouped + decimal + frac;
}

const SYMBOLS: Record<string, string> = { COP: '$', USD: 'US$', EUR: '€', MXN: 'MX$', GBP: '£' };

// Paynela design: "$12.000", "US$12,50", decimals only when there are cents; other assets keep their code
// ("12,50 ZAR"). An empty assetCode gives the plain digits with every decimal, as entry fields need.
export function formatMoney(amount: string, scale: number, assetCode: string, lang: Lang) {
  const digits = formatDigits(amount, scale, lang);
  if (!assetCode) return digits;
  const [int, frac] = digits.split(lang === 'es' ? ',' : '.');
  const number = frac === undefined || /^0+$/.test(frac) ? int : digits;
  const symbol = SYMBOLS[assetCode];
  return symbol ? `${symbol}${number}` : `${number} ${assetCode}`;
}

// What a sale costs the buyer, in their wallet's asset once the quote is known; the sale amount until then.
export function buyerAmount(sale: SaleView, lang: Lang) {
  return sale.debitAmount && sale.debitAssetCode
    ? formatMoney(sale.debitAmount, sale.debitAssetScale ?? 0, sale.debitAssetCode, lang)
    : formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang);
}

const NOUNS: Record<string, Record<Lang, [string, string]>> = {
  COP: { es: ['peso', 'pesos'], en: ['peso', 'pesos'] },
  USD: { es: ['dólar', 'dólares'], en: ['dollar', 'dollars'] },
  EUR: { es: ['euro', 'euros'], en: ['euro', 'euros'] },
  MXN: { es: ['peso mexicano', 'pesos mexicanos'], en: ['Mexican peso', 'Mexican pesos'] },
};

// "Doce mil pesos" under a big amount (design: Cobrar). Cents, at scale 2, follow as "con … centavos".
// shortcut: Number is exact up to 2^53 whole units, far past any sale.
export function amountInWords(amount: string, scale: number, assetCode: string, lang: Lang) {
  const [int, frac = ''] = formatAmount(amount, scale).split('.');
  const units = Number(int);
  const cents = scale === 2 ? Number(frac) : 0;
  const [one, many] = NOUNS[assetCode]?.[lang] ?? [assetCode, assetCode];
  const noun = units === 1 ? one : many;
  let text: string;
  if (lang === 'es') {
    // "un millón de pesos", but "un millón doscientos mil pesos".
    const de = units >= 1e6 && units % 1e6 === 0 ? ' de' : '';
    text = `${apocope(esWords(units))}${de} ${noun}`;
    if (cents) text += ` con ${apocope(esWords(cents))} ${cents === 1 ? 'centavo' : 'centavos'}`;
  } else {
    text = `${enWords(units)} ${noun}`;
    if (cents) text += ` and ${enWords(cents)} ${cents === 1 ? 'cent' : 'cents'}`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ES_SMALL = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

// "uno" shortens before a noun: un peso, veintiún mil, treinta y un millones.
function apocope(words: string) {
  if (words.endsWith('veintiuno')) return `${words.slice(0, -9)}veintiún`;
  return words.endsWith('uno') ? words.slice(0, -1) : words;
}

function es999(n: number) {
  if (n === 100) return 'cien';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tens = rest < 30 ? ES_SMALL[rest] : `${ES_TENS[Math.floor(rest / 10)]}${rest % 10 ? ` y ${ES_SMALL[rest % 10]}` : ''}`;
  return [hundreds ? ES_HUNDREDS[hundreds] : '', rest ? tens : ''].filter(Boolean).join(' ');
}

function esWords(n: number): string {
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  return [
    millions ? (millions === 1 ? 'un millón' : `${apocope(esWords(millions))} millones`) : '',
    thousands ? (thousands === 1 ? 'mil' : `${apocope(es999(thousands))} mil`) : '',
    rest ? es999(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const EN_SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function en999(n: number) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tens = rest < 20 ? EN_SMALL[rest] : `${EN_TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${EN_SMALL[rest % 10]}` : ''}`;
  return [hundreds ? `${EN_SMALL[hundreds]} hundred` : '', rest ? tens : ''].filter(Boolean).join(' ');
}

function enWords(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    const count = Math.floor(rest / size);
    if (count) parts.push(`${enWords(count)} ${name}`);
    rest %= size;
  }
  if (rest) parts.push(en999(rest));
  return parts.join(' ');
}
