import { api } from '@/api/client';
import type { VendorView, VendorWalletView } from '@/api/types';
import { addressPath } from '@/components/vendor/format';

// shortcut: a service without multi-wallet vendors sends no `wallets`; its single wallet stands in as the only one.
// Delete once every running service answers with wallets.
export function vendorWallets(vendor: VendorView): VendorWalletView[] {
  return (
    vendor.wallets ?? [
      {
        id: vendor.id,
        walletAddress: vendor.walletAddress,
        assetCode: vendor.assetCode,
        assetScale: vendor.assetScale,
        publicName: vendor.publicName ?? null,
        isDefault: true,
      },
    ]
  );
}

// The receiving (default) wallet first, then the others in creation order.
export function defaultFirst(wallets: VendorWalletView[]) {
  return [...wallets].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// "USD · /tourism": enough to tell a vendor's wallets apart in a filter chip.
export const walletLabel = (wallet: VendorWalletView) => `${wallet.assetCode} · ${addressPath(wallet.walletAddress)}`;

// Writes on the receiving wallets; each answers with the fresh VendorView, which `replace` swaps into the cache.
export function vendorWalletActions(vendor: VendorView, replace: (next: VendorView) => void) {
  const write = async (path: string, init: { method: string; body?: unknown }) => {
    const next = await api<VendorView>(`/vendors/${vendor.id}${path}`, init);
    replace(next);
    return next;
  };
  return {
    setDefault: (wallet: VendorWalletView) => write('/default-wallet', { method: 'PUT', body: { walletId: wallet.id } }),
    // The wallet missing from the previous list is the one just added.
    addWallet: async (walletAddress: string) => {
      const known = new Set(vendorWallets(vendor).map((wallet) => wallet.id));
      const next = await write('/wallets', { method: 'POST', body: { walletAddress } });
      return vendorWallets(next).find((wallet) => !known.has(wallet.id)) ?? null;
    },
    removeWallet: (wallet: VendorWalletView) => write(`/wallets/${wallet.id}`, { method: 'DELETE' }),
  };
}
