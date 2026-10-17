import { api } from '@/api/client';
import type { BuyerView, BuyerWalletView } from '@/api/types';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import type { Lang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

type Limits = { perPaymentLimit: string; dailyLimit: string };

// What stops this phone from paying as a card, checked in this order (Inicio's switch and Activar pagos share it);
// null when nothing does. It reads the phone's NFC state, so callers re-run it on focus instead of memoizing it.
export type CardBlocker = 'module' | 'nfc' | 'nfcOff' | 'hce' | 'grant';

export function cardBlocker(defaultWallet: BuyerWalletView | null): CardBlocker | null {
  if (!NfcTap) return 'module';
  if (!NfcTap.isSupported()) return 'nfc';
  if (!NfcTap.isEnabled()) return 'nfcOff';
  if (!NfcTap.isHceSupported()) return 'hce';
  return defaultWallet?.hasGrant ? null : 'grant';
}

const CURRENCIES: Record<string, Record<Lang, string>> = {
  COP: { es: 'Pesos colombianos', en: 'Colombian pesos' },
  USD: { es: 'Dólares', en: 'US dollars' },
  EUR: { es: 'Euros', en: 'Euros' },
  MXN: { es: 'Pesos mexicanos', en: 'Mexican pesos' },
};

// The currency's name on the card face and the activation checklist; other assets keep their code.
export const currencyName = (code: string, lang: Lang) => CURRENCIES[code]?.[lang] ?? code;

// shortcut: a service without multi-wallet support sends no `wallets`; its single wallet stands in as the only card.
// Delete once every running service answers with wallets.
const walletsOf = (buyer: BuyerView): BuyerWalletView[] =>
  buyer.wallets ?? [
    { ...buyer, id: buyer.id, isDefault: true, grantDailyLimit: buyer.grantDailyLimit ?? null, publicName: buyer.publicName ?? null },
  ];

// This phone's buyer and its cards: the buyer's wallets in creation order, the default one marked by the service.
// Every write answers with the fresh BuyerView, which replaces the cached one.
export function useBuyerCards() {
  const { buyerId } = useSession();
  const { data: buyer, error, loading, reload, set } = useApi<BuyerView>(buyerId ? `/buyers/${buyerId}` : null);
  const wallets = buyer ? walletsOf(buyer) : [];
  const defaultWallet = wallets.find((wallet) => wallet.isDefault) ?? null;

  const write = async (path: string, init: { method: string; body?: unknown }) => {
    const next = await api<BuyerView>(`/buyers/${buyerId}${path}`, init);
    set(next);
    return next;
  };

  // The phone answers taps with the default wallet only, so an active payload follows it; a default without a
  // grant could only be refused, so the payload is cleared instead.
  const setDefault = async (wallet: BuyerWalletView) => {
    const next = await write('/default-wallet', { method: 'PUT', body: { walletId: wallet.id } });
    const now = walletsOf(next).find((w) => w.isDefault);
    if (NfcTap?.getCardPayload()) NfcTap.setCardPayload(now?.hasGrant ? now.walletAddress : null);
    return next;
  };

  // A new wallet arrives without a grant; the one missing from the previous list is the added card.
  const addWallet = async (walletAddress: string) => {
    const known = new Set(wallets.map((wallet) => wallet.id));
    const next = await write('/wallets', { method: 'POST', body: { walletAddress } });
    return walletsOf(next).find((wallet) => !known.has(wallet.id)) ?? null;
  };

  // The phone stops answering with a wallet the buyer no longer has.
  const removeWallet = async (wallet: BuyerWalletView) => {
    const next = await write(`/wallets/${wallet.id}`, { method: 'DELETE' });
    if (NfcTap?.getCardPayload() === wallet.walletAddress) NfcTap.setCardPayload(null);
    return next;
  };

  const updateLimits = (wallet: BuyerWalletView, limits: Limits) =>
    write(`/wallets/${wallet.id}/limits`, { method: 'PATCH', body: limits });

  return { buyer, wallets, defaultWallet, error, loading, reload, setDefault, addWallet, removeWallet, updateLimits };
}
