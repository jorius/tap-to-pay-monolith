import { toWalletError } from '../open-payments/types.js';
import type { Deps } from './sales.js';

type Stored = { walletAddress: string; publicName: string | null };

/**
 * At service start: saves every registered wallet's current publicName, so wallets added before it was stored, or
 * renamed in their wallet since, show it. A wallet that can't be read is logged and keeps what it had.
 */
export async function refreshPublicNames(deps: Pick<Deps, 'repo' | 'op'>): Promise<void> {
  const refresh = async (wallet: Stored, save: (publicName: string | null) => Promise<void>) => {
    try {
      const { publicName } = await deps.op.getWalletAddress(wallet.walletAddress);
      if (publicName !== wallet.publicName) await save(publicName);
    } catch (err) {
      console.warn(`Could not refresh the public name of ${wallet.walletAddress}: ${toWalletError(err).message}`);
    }
  };
  const [buyers, vendors] = await Promise.all([deps.repo.listBuyers(), deps.repo.listVendors()]);
  await Promise.all([
    ...buyers.flatMap((b) => b.wallets.map((w) => refresh(w, (name) => deps.repo.updateWalletPublicName(w.id, name)))),
    ...vendors.flatMap((v) =>
      v.wallets.map((w) => refresh(w, (name) => deps.repo.updateVendorWalletPublicName(w.id, name))),
    ),
  ]);
}
