import type { BillerView } from '../contracts.js';
import type { Deps } from './sales.js';

// The services a Colombian buyer pays every month. The app draws each as a badge in the brand's colour with its
// initials; the logos themselves are the brands' trademarks and are not shipped. Each receives into the Interledger
// wallet configured for it (BILLER_WALLETS), else into BILLERS_DEFAULT_WALLET.
type Biller = Omit<BillerView, 'available'>;

export const BILLERS: Biller[] = [
  {
    id: 'epm',
    name: 'EPM',
    category: 'Servicios públicos',
    description: 'Energía, agua, gas y aseo',
    color: '#00843D',
    textColor: '#FFFFFF',
    initials: 'EPM',
    referenceLabel: 'Número de contrato',
  },
  {
    id: 'claro',
    name: 'Claro',
    category: 'Telefonía e internet',
    description: 'Plan móvil, hogar y televisión',
    color: '#DA291C',
    textColor: '#FFFFFF',
    initials: 'C',
    referenceLabel: 'Número de línea o cuenta',
  },
  {
    id: 'tigo',
    name: 'Tigo',
    category: 'Telefonía e internet',
    description: 'Plan móvil, hogar y televisión',
    color: '#00377B',
    textColor: '#FFFFFF',
    initials: 'T',
    referenceLabel: 'Número de línea o cuenta',
  },
  {
    id: 'movistar',
    name: 'Movistar',
    category: 'Telefonía e internet',
    description: 'Plan móvil y fibra',
    color: '#019DF4',
    textColor: '#FFFFFF',
    initials: 'M',
    referenceLabel: 'Número de línea o cuenta',
  },
  {
    id: 'etb',
    name: 'ETB',
    category: 'Telefonía e internet',
    description: 'Internet y telefonía fija',
    color: '#0067B1',
    textColor: '#FFFFFF',
    initials: 'ETB',
    referenceLabel: 'Número de cuenta',
  },
  {
    id: 'vanti',
    name: 'Vanti',
    category: 'Servicios públicos',
    description: 'Gas natural',
    color: '#6CC24A',
    textColor: '#0B2A12',
    initials: 'V',
    referenceLabel: 'Número de cuenta',
  },
];

/** BILLER_WALLETS ("epm=https://…,claro=https://…") as a map; malformed pairs are left out. */
export function parseBillerWallets(value: string | undefined): Record<string, string> {
  const wallets: Record<string, string> = {};
  for (const pair of (value ?? '').split(',')) {
    const [id, url] = pair.split('=').map((s) => s?.trim());
    if (id && url && /^https?:\/\//.test(url)) wallets[id.toLowerCase()] = url;
  }
  return wallets;
}

export function billerWallet(deps: Pick<Deps, 'billers'>, billerId: string): string | undefined {
  return deps.billers.wallets[billerId] ?? deps.billers.defaultWallet;
}

/** GET /billers. */
export function listBillers(deps: Pick<Deps, 'billers'>): BillerView[] {
  return BILLERS.map((b) => ({ ...b, available: billerWallet(deps, b.id) !== undefined }));
}

export function findBiller(id: string): Biller | undefined {
  return BILLERS.find((b) => b.id === id);
}
