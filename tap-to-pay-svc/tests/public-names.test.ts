import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletError } from '../src/open-payments/types.js';
import { refreshPublicNames } from '../src/services/public-names.js';
import { BUYER_WALLET, makeDeps, VENDOR_WALLET } from './fakes.js';

const SAVINGS = 'https://ilp.test/ana-ahorros';
const OLD_STAND = 'https://ilp.test/tienda-vieja';

describe('refreshPublicNames', () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves each wallet's current public name and keeps what it had for a wallet it can't read", async () => {
    const ctx = makeDeps();
    const ana = ctx.repo.addBuyer();
    const savings = ctx.repo.addBuyerWallet(ana.id, { walletAddress: SAVINGS, publicName: 'Ahorros' });
    const tienda = ctx.repo.addVendor();
    const stand = ctx.repo.addVendorWallet(tienda.id, { walletAddress: OLD_STAND, publicName: 'Vieja' });
    ctx.op.script.wallets[BUYER_WALLET] = { publicName: 'Ana Pérez' };
    ctx.op.script.wallets[VENDOR_WALLET] = { publicName: 'Tienda La 14' };
    const resolve = ctx.op.getWalletAddress.bind(ctx.op);
    ctx.op.getWalletAddress = async (url: string) => {
      if (url === SAVINGS) throw new WalletError('Could not find wallet address', 404);
      return resolve(url);
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await refreshPublicNames(ctx.deps);

    expect(ctx.repo.wallets.get(ana.wallet.id)!.publicName).toBe('Ana Pérez');
    expect(ctx.repo.vendorWallets.get(tienda.wallet.id)!.publicName).toBe('Tienda La 14');
    // Its document no longer publishes a name.
    expect(ctx.repo.vendorWallets.get(stand.id)!.publicName).toBeNull();
    expect(ctx.repo.wallets.get(savings.id)!.publicName).toBe('Ahorros');
    expect(warn.mock.calls).toEqual([[`Could not refresh the public name of ${SAVINGS}: Could not find wallet address`]]);
  });
});
