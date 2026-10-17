import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { expectedInteractionHashes } from '../src/open-payments/hash.js';
import { WalletError } from '../src/open-payments/types.js';
import { BUYER_WALLET, makeDeps, NOW } from './fakes.js';

const FINISH = 'paynela://grant-finish';

function setup() {
  let now = NOW;
  const ctx = makeDeps({ now: () => now });
  const buyer = ctx.repo.addBuyer({ wallet: { grantAccessToken: null, grantManageUrl: null } });
  const app = createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
  const base = `/buyers/${buyer.id}/wallets/${buyer.wallet.id}/grant`;
  const later = (ms: number) => (now = new Date(NOW.getTime() + ms));
  return { ...ctx, app, buyer, base, later };
}

// The hash the wallet sends back for the grant the service started on that wallet.
function walletHash(ctx: ReturnType<typeof setup>, interactRef: string) {
  const { grant } = ctx.deps.pendingGrants.get(ctx.buyer.wallet.id)!;
  const input = { clientNonce: grant.clientNonce, interactNonce: grant.interactNonce, interactRef, authServer: grant.authServer };
  return expectedInteractionHashes(input)[0];
}

const storedWallet = async (ctx: ReturnType<typeof setup>) =>
  (await ctx.repo.getBuyer(ctx.buyer.id))!.wallets.find((w) => w.id === ctx.buyer.wallet.id)!;

describe('in-app authorization (grant)', () => {
  it('starts the grant capped per local day and stores the token once the wallet answers', async () => {
    const ctx = setup();
    const start = await request(ctx.app).post(ctx.base).send({ finishUri: FINISH, amount: '3000' });
    expect(start.status).toBe(200);
    expect(start.body.data).toEqual({ redirectUrl: `${BUYER_WALLET}/auth/interact/1` });
    // The interval starts at today's Bogotá midnight, like the service's own daily cap.
    expect(ctx.op.calls).toContain(`grant:${BUYER_WALLET}:3000:2026-10-14T05:00:00.000Z:${FINISH}`);

    const finish = await request(ctx.app)
      .post(`${ctx.base}/finish`)
      .send({ interactRef: 'ref-1', hash: walletHash(ctx, 'ref-1') });
    expect(finish.status).toBe(200);
    expect(finish.body.data.wallets[0]).toEqual(expect.objectContaining({ hasGrant: true, grantDailyLimit: '3000' }));
    expect(await storedWallet(ctx)).toEqual(
      expect.objectContaining({ grantAccessToken: 'granted-token', grantManageUrl: 'https://auth.test/token/granted', grantDailyLimit: 3000n }),
    );
    expect(ctx.op.calls).toContain('continue:continue-token-1:ref-1');
    expect(ctx.deps.pendingGrants.size).toBe(0);
  });

  it("defaults to the wallet's daily limit", async () => {
    const ctx = setup();
    await request(ctx.app).post(ctx.base).send({ finishUri: FINISH });
    expect(ctx.op.calls).toContain(`grant:${BUYER_WALLET}:5000:2026-10-14T05:00:00.000Z:${FINISH}`);
  });

  it('refuses a hash that does not verify, and allows one try per start', async () => {
    const ctx = setup();
    await request(ctx.app).post(ctx.base).send({ finishUri: FINISH });
    const bad = await request(ctx.app).post(`${ctx.base}/finish`).send({ interactRef: 'ref-1', hash: 'bogus' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('GRANT_HASH_MISMATCH');
    expect((await storedWallet(ctx)).grantAccessToken).toBeNull();
    expect(ctx.op.calls.some((c) => c.startsWith('continue:'))).toBe(false);

    const again = await request(ctx.app).post(`${ctx.base}/finish`).send({ interactRef: 'ref-1', hash: 'bogus' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('GRANT_NOT_PENDING');
  });

  it('needs a grant in progress that has not expired', async () => {
    const ctx = setup();
    const none = await request(ctx.app).post(`${ctx.base}/finish`).send({ interactRef: 'ref-1', hash: 'h' });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('GRANT_NOT_PENDING');

    await request(ctx.app).post(ctx.base).send({ finishUri: FINISH });
    const hash = walletHash(ctx, 'ref-1');
    ctx.later(10 * 60_000);
    const expired = await request(ctx.app).post(`${ctx.base}/finish`).send({ interactRef: 'ref-1', hash });
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe('GRANT_NOT_PENDING');
  });

  it('turns wallet failures into GRANT_FAILED with the wallet message', async () => {
    const ctx = setup();
    ctx.op.script.failOn.grant = new WalletError('finish uri not allowed', 400);
    const start = await request(ctx.app).post(ctx.base).send({ finishUri: FINISH });
    expect(start.status).toBe(502);
    expect(start.body.error).toEqual({ code: 'GRANT_FAILED', message: 'finish uri not allowed' });
    expect(ctx.deps.pendingGrants.size).toBe(0);

    delete ctx.op.script.failOn.grant;
    ctx.op.script.failOn.continue = new WalletError('interaction expired', 400);
    await request(ctx.app).post(ctx.base).send({ finishUri: FINISH });
    const finish = await request(ctx.app)
      .post(`${ctx.base}/finish`)
      .send({ interactRef: 'ref-1', hash: walletHash(ctx, 'ref-1') });
    expect(finish.status).toBe(502);
    expect(finish.body.error).toEqual({ code: 'GRANT_FAILED', message: 'interaction expired' });
    expect((await storedWallet(ctx)).grantAccessToken).toBeNull();
  });

  it("validates the input and only touches the buyer's own wallets", async () => {
    const ctx = setup();
    const other = ctx.repo.addBuyer({ name: 'Luis', wallet: { walletAddress: 'https://ilp.test/luis' } });
    const cases = [
      { body: {}, status: 400, code: 'VALIDATION' },
      { body: { finishUri: 'not a url' }, status: 400, code: 'VALIDATION' },
      { body: { finishUri: FINISH, amount: '12.50' }, status: 400, code: 'VALIDATION' },
    ];
    for (const { body, status, code } of cases) {
      const res = await request(ctx.app).post(ctx.base).send(body);
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
    }
    const foreign = await request(ctx.app)
      .post(`/buyers/${ctx.buyer.id}/wallets/${other.wallet.id}/grant`)
      .send({ finishUri: FINISH });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('WALLET_NOT_FOUND');
    const noHash = await request(ctx.app).post(`${ctx.base}/finish`).send({ interactRef: 'ref-1' });
    expect(noHash.status).toBe(400);
    expect(ctx.op.calls.some((c) => c.startsWith('grant:'))).toBe(false);
  });
});

describe('removing an authorization', () => {
  // The fake buyer's wallet starts authorized: token-1, managed at https://auth.test/token/1.
  function authorized() {
    const ctx = makeDeps();
    const buyer = ctx.repo.addBuyer({ wallet: { grantDailyLimit: 5000n } });
    const app = createApp(ctx.deps, { clientWalletAddress: 'https://ilp.test/service' });
    return { ...ctx, app, buyer, path: `/buyers/${buyer.id}/wallets/${buyer.wallet.id}/grant` };
  }

  it('revokes the token at the wallet and forgets the grant', async () => {
    const ctx = authorized();
    const res = await request(ctx.app).delete(ctx.path);
    expect(res.status).toBe(200);
    expect(res.body.data.wallets[0]).toEqual(expect.objectContaining({ hasGrant: false, grantDailyLimit: null }));
    expect(ctx.op.calls).toContain('revoke:https://auth.test/token/1:token-1');
    expect((await ctx.repo.getBuyer(ctx.buyer.id))!.wallets[0]).toEqual(
      expect.objectContaining({ grantAccessToken: null, grantManageUrl: null, grantDailyLimit: null }),
    );
  });

  it('forgets a grant the wallet already revoked, and one it cannot revoke right now', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cases = [
      { status: 401, warned: false },
      { status: 403, warned: false },
      { status: 404, warned: false },
      { status: 503, warned: true },
    ];
    for (const { status, warned } of cases) {
      const ctx = authorized();
      ctx.op.script.failOn.revoke = new WalletError('grant not active', status);
      warn.mockClear();
      const res = await request(ctx.app).delete(ctx.path);
      expect(res.status).toBe(200);
      expect(res.body.data.wallets[0].hasGrant).toBe(false);
      expect(warn).toHaveBeenCalledTimes(warned ? 1 : 0);
    }
    warn.mockRestore();
  });

  it("only touches the buyer's own wallets", async () => {
    const ctx = authorized();
    const other = ctx.repo.addBuyer({ name: 'Luis', wallet: { walletAddress: 'https://ilp.test/luis' } });
    const res = await request(ctx.app).delete(`/buyers/${ctx.buyer.id}/wallets/${other.wallet.id}/grant`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
    expect((await ctx.repo.getBuyer(other.id))!.wallets[0].grantAccessToken).toBe('token-1');
    expect(ctx.op.calls.some((c) => c.startsWith('revoke:'))).toBe(false);
  });
});
