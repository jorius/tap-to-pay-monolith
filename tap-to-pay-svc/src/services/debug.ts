import type { DebugWallet, DebugWallets } from '../contracts.js';
import { toWalletError } from '../open-payments/types.js';
import type { Deps } from './sales.js';

type Entry = Pick<DebugWallet, 'role' | 'name' | 'walletAddress' | 'hasGrant'>;

/** GET /debug/wallets: every wallet address the service knows, resolved live. Never throws, never returns a token. */
export async function debugWallets(
  deps: Pick<Deps, 'repo' | 'op' | 'now'>,
  clientWalletAddress: string,
): Promise<DebugWallets> {
  const entries: Entry[] = [{ role: 'client', name: 'service', walletAddress: clientWalletAddress, hasGrant: null }];
  let database: DebugWallets['database'] = 'ok';
  try {
    const [buyers, vendors] = await Promise.all([deps.repo.listBuyers(), deps.repo.listVendors()]);
    // One entry per wallet: a buyer or vendor with N wallets appears N times under the same name.
    for (const b of buyers) {
      for (const w of b.wallets) {
        entries.push({ role: 'buyer', name: b.name, walletAddress: w.walletAddress, hasGrant: w.grantAccessToken !== null });
      }
    }
    for (const v of vendors) {
      for (const w of v.wallets) {
        entries.push({ role: 'vendor', name: v.name, walletAddress: w.walletAddress, hasGrant: null });
      }
    }
  } catch {
    database = 'error';
  }
  const wallets = await Promise.all(entries.map((entry) => resolve(deps, entry)));
  return { checkedAt: deps.now().toISOString(), database, wallets };
}

async function resolve(deps: Pick<Deps, 'op'>, entry: Entry): Promise<DebugWallet> {
  try {
    const { assetCode, assetScale } = await deps.op.getWalletAddress(entry.walletAddress);
    return { ...entry, reachable: true, assetCode, assetScale, error: null };
  } catch (err) {
    return { ...entry, reachable: false, assetCode: null, assetScale: null, error: toWalletError(err).message };
  }
}
