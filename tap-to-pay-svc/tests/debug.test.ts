import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { WalletError } from '../src/open-payments/types.js';
import { debugWallets } from '../src/services/debug.js';
import { BUYER_WALLET, makeDeps, NOW, VENDOR_WALLET } from './fakes.js';

const CLIENT = 'https://ilp.test/service';
const MARTA_WALLET = 'https://ilp.test/marta';
const ANA_SAVINGS = 'https://ilp.test/ana-ahorros';
const TIENDA_EUR = 'https://ilp.test/tienda-eur';

describe('GET /debug/wallets', () => {
  it('resolves the client first, then every buyer and vendor wallet, live, and never shows a token', async () => {
    const ctx = makeDeps();
    const ana = ctx.repo.addBuyer();
    ctx.repo.addBuyerWallet(ana.id, { walletAddress: ANA_SAVINGS, grantAccessToken: null, grantManageUrl: null });
    ctx.repo.addBuyer({ name: 'Marta', wallet: { walletAddress: MARTA_WALLET, grantAccessToken: null, grantManageUrl: null } });
    const tienda = ctx.repo.addVendor();
    ctx.repo.addVendorWallet(tienda.id, { walletAddress: TIENDA_EUR });
    ctx.op.script.wallets[VENDOR_WALLET] = { assetCode: 'EUR' };

    const res = await request(createApp(ctx.deps, { clientWalletAddress: CLIENT })).get('/debug/wallets');
    const live = { reachable: true, assetScale: 2, error: null };
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        checkedAt: NOW.toISOString(),
        database: 'ok',
        wallets: [
          { role: 'client', name: 'service', walletAddress: CLIENT, assetCode: 'USD', hasGrant: null, ...live },
          { role: 'buyer', name: 'Ana', walletAddress: BUYER_WALLET, assetCode: 'USD', hasGrant: true, ...live },
          { role: 'buyer', name: 'Ana', walletAddress: ANA_SAVINGS, assetCode: 'USD', hasGrant: false, ...live },
          { role: 'buyer', name: 'Marta', walletAddress: MARTA_WALLET, assetCode: 'USD', hasGrant: false, ...live },
          { role: 'vendor', name: 'Tienda', walletAddress: VENDOR_WALLET, assetCode: 'EUR', hasGrant: null, ...live },
          { role: 'vendor', name: 'Tienda', walletAddress: TIENDA_EUR, assetCode: 'USD', hasGrant: null, ...live },
        ],
      },
      error: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/token|manage/);
  });

  it('reports an unreachable wallet with its error instead of failing', async () => {
    const ctx = makeDeps();
    ctx.repo.addBuyer();
    const resolve = ctx.op.getWalletAddress.bind(ctx.op);
    ctx.op.getWalletAddress = async (url: string) => {
      if (url === BUYER_WALLET) throw new WalletError('Could not find wallet address', 404);
      return resolve(url);
    };
    const { wallets } = await debugWallets(ctx.deps, CLIENT);
    expect(wallets[0]).toMatchObject({ role: 'client', reachable: true });
    expect(wallets[1]).toEqual({
      role: 'buyer',
      name: 'Ana',
      walletAddress: BUYER_WALLET,
      reachable: false,
      assetCode: null,
      assetScale: null,
      error: 'Could not find wallet address',
      hasGrant: true,
    });
  });

  it('answers with only the client when the database fails', async () => {
    const ctx = makeDeps();
    ctx.repo.listBuyers = async () => {
      throw new Error('connection refused');
    };
    const result = await debugWallets(ctx.deps, CLIENT);
    expect(result.database).toBe('error');
    expect(result.wallets.map((w) => w.role)).toEqual(['client']);
  });
});
