import { randomBytes } from 'node:crypto';
import type { Repo } from '../db/repos.js';
import { expectedInteractionHashes, verifyInteractionHash } from '../open-payments/hash.js';
import type { OpenPayments, PendingGrant, WalletInfo } from '../open-payments/types.js';
import { dayRange } from './limits.js';

// The interactive outgoing-payment grant of SDD section 10, step 3, shared by npm run grant:buyer and the app's
// authorization screen: request it, then check the finish redirect and store the token.

/** A grant waiting for the buyer's consent, with what finishing it needs. */
export type GrantInProgress = PendingGrant & { walletId: string; authServer: string; clientNonce: string; dailyDebit: bigint };

/** Grants started from the app, by wallet id, until finished or expired; memory only, so a restart drops them. */
export type PendingGrants = Map<string, { grant: GrantInProgress; expiresAt: number }>;

export class InteractionHashError extends Error {
  constructor(
    readonly received: string,
    readonly expected: string[],
  ) {
    super('The interaction hash did not verify');
    this.name = 'InteractionHashError';
  }
}

/** Requests the grant, capped by the wallet itself at dailyDebit per local day from today's local midnight. */
export async function startGrant(
  op: OpenPayments,
  wallet: { id: string; walletAddress: string },
  input: { dailyDebit: bigint; finishUri: string; now: Date; timeZone: string },
): Promise<{ info: WalletInfo; grant: GrantInProgress }> {
  const info = await op.getWalletAddress(wallet.walletAddress);
  const clientNonce = randomBytes(16).toString('hex');
  const intervalStart = dayRange(input.now, input.timeZone).start.toISOString();
  const pending = await op.requestOutgoingPaymentGrant(info, {
    dailyDebit: input.dailyDebit,
    intervalStart,
    finishUri: input.finishUri,
    clientNonce,
  });
  return { info, grant: { ...pending, walletId: wallet.id, authServer: info.authServer, clientNonce, dailyDebit: input.dailyDebit } };
}

/** Checks the finish redirect's hash, continues the grant and stores its token and daily cap on the wallet. */
export async function finishGrant(
  deps: { repo: Repo; op: OpenPayments },
  grant: GrantInProgress,
  { interactRef, hash }: { interactRef: string; hash: string },
): Promise<void> {
  const input = { clientNonce: grant.clientNonce, interactNonce: grant.interactNonce, interactRef, authServer: grant.authServer };
  if (!verifyInteractionHash({ ...input, hash })) throw new InteractionHashError(hash, expectedInteractionHashes(input));
  const token = await deps.op.continueGrant(grant, interactRef);
  await deps.repo.updateWalletGrant(grant.walletId, {
    grantAccessToken: token.value,
    grantManageUrl: token.manage,
    grantDailyLimit: grant.dailyDebit,
  });
}
