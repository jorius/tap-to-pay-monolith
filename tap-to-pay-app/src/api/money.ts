import type { Lang } from '@/i18n';

// Amounts are digit strings in the asset's smallest unit (SDD section 8): "1200" at scale 2 is "12.00". No floats.
export function formatAmount(amount: string, scale: number) {
  const digits = amount.replace(/^0+(?=\d)/, '').padStart(scale + 1, '0');
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

// es-CO groups thousands with a dot and decimals with a comma, asset code last (design: 1.234,50 USD).
export function formatMoney(amount: string, scale: number, assetCode: string, lang: Lang) {
  const [int, frac] = formatAmount(amount, scale).split('.');
  const [group, decimal] = lang === 'es' ? ['.', ','] : [',', '.'];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${frac === undefined ? grouped : grouped + decimal + frac} ${assetCode}`;
}
