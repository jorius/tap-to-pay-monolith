import type { SaleView } from '../contracts.js';
import { refreshSale, type Deps } from './sales.js';

// The payment link: the same sale the NFC tap charges, reached through a URL instead of a tap. The buyer opens it
// from the vendor's QR or from WhatsApp, types their wallet address once (the page remembers it), and the page calls
// POST /sales/:id/charge, so the rules, the grant and the caps are exactly those of a tap.

export type PayLink = { url: string; whatsappUrl: string; text: string };

type HeaderSource = { protocol: string; get(name: string): string | undefined };

/** PUBLIC_URL when set; else what the phone used to reach us, honouring the proxy headers of tunnels and hosts. */
export function publicBaseUrl(req: HeaderSource, configured?: string): string {
  if (configured) return configured.replace(/\/+$/, '');
  const first = (value: string | undefined) => value?.split(',')[0]?.trim() || undefined;
  const proto = first(req.get('x-forwarded-proto')) ?? req.protocol;
  const host = first(req.get('x-forwarded-host')) ?? req.get('host') ?? 'localhost';
  return `${proto}://${host}`;
}

export const payUrl = (baseUrl: string, saleId: string) => `${baseUrl}/pay/${encodeURIComponent(saleId)}`;

/** The sale as the payment page shows it, with the vendor's display name (receiving wallet's public name first). */
export async function payPageData(deps: Deps, saleId: string): Promise<{ sale: SaleView; vendorName: string }> {
  const sale = await refreshSale(deps, saleId);
  const vendor = await deps.repo.getVendor(sale.vendorId);
  const wallet = vendor?.wallets.find((w) => w.id === sale.vendorWalletId);
  return { sale, vendorName: wallet?.publicName ?? vendor?.name ?? '' };
}

/** The link the vendor shares, plus a wa.me URL that opens WhatsApp with the message ready to send to any contact. */
export async function payLink(deps: Deps, saleId: string, baseUrl: string): Promise<PayLink> {
  const { sale, vendorName } = await payPageData(deps, saleId);
  const url = payUrl(baseUrl, saleId);
  const text = `Hola, este es el cobro de ${sale.amountFormatted} ${sale.assetCode} de ${vendorName}. Paga aquí con tu billetera: ${url}`;
  return { url, text, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}` };
}
