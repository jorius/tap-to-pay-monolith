import type { BuyerSales, BuyerView, GrantStart } from '../contracts.js';
import type { BuyerWalletRow, BuyerWithWallets, Limits } from '../db/repos.js';
import { isUnauthorized, toWalletError, type WalletInfo } from '../open-payments/types.js';
import { HttpError, validation } from './errors.js';
import { finishGrant, InteractionHashError, startGrant } from './grants.js';
import { dayRange, remainingToday } from './limits.js';
import { parseAmount } from './money.js';
import type { Deps } from './sales.js';
import { buyerView, defaultWallet, saleView } from './views.js';

type BuyerDeps = Pick<Deps, 'repo' | 'now' | 'timeZone'>;
type WalletDeps = BuyerDeps & Pick<Deps, 'op' | 'defaultLimits'>;
type GrantDeps = BuyerDeps & Pick<Deps, 'op' | 'pendingGrants'>;

const HISTORY_SIZE = 20;
const GRANT_TTL_MS = 10 * 60_000;

export async function listBuyerViews(deps: BuyerDeps): Promise<BuyerView[]> {
  const [buyers, vendors] = await Promise.all([deps.repo.listBuyers(), deps.repo.listVendors()]);
  // A vendor's payer identity (its own wallets, for its recurring payments) is not a phone's buyer.
  const payers = new Set(vendors.map((v) => v.payerBuyerId).filter((id): id is string => id !== null));
  // A buyer left without wallets has no view; skip it rather than fail the whole list (add:wallet repairs it).
  return Promise.all(buyers.filter((b) => b.wallets.length > 0 && !payers.has(b.id)).map((b) => view(deps, b)));
}

export async function getBuyer(deps: BuyerDeps, id: string): Promise<BuyerView> {
  return view(deps, await loadBuyer(deps, id));
}

/** PATCH /buyers/:id/limits: the default wallet's caps (the one-wallet contract of SDD section 9). */
export async function updateLimits(
  deps: BuyerDeps,
  id: string,
  input: { perPaymentLimit: string; dailyLimit: string },
): Promise<BuyerView> {
  const buyer = await loadBuyer(deps, id);
  return updateWalletLimits(deps, id, defaultWallet(buyer).id, input);
}

/** Caps are enforced by the service, so changing them never needs a new grant (the grant's own limit aside). */
export async function updateWalletLimits(
  deps: BuyerDeps,
  buyerId: string,
  walletId: string,
  input: { perPaymentLimit: string; dailyLimit: string },
): Promise<BuyerView> {
  const limits = parseLimits(input);
  const buyer = await loadBuyer(deps, buyerId);
  ownWallet(buyer, walletId);
  await deps.repo.updateWalletLimits(walletId, limits);
  return getBuyer(deps, buyerId);
}

/**
 * POST /buyers/:id/wallets and npm run add:wallet: one more wallet for an existing buyer. The asset comes from the
 * live wallet address document; caps from the input or the configured defaults. A buyer's first wallet becomes the
 * default one.
 */
export async function addWallet(
  deps: WalletDeps,
  buyerId: string,
  input: { walletAddress: string; perPaymentLimit?: string; dailyLimit?: string },
): Promise<BuyerView> {
  const { walletAddress } = input;
  if (!URL.canParse(walletAddress)) throw validation(`walletAddress must be a URL, got ${JSON.stringify(walletAddress)}`);
  const limits = parseLimits({
    perPaymentLimit: input.perPaymentLimit ?? deps.defaultLimits.perPaymentLimit.toString(),
    dailyLimit: input.dailyLimit ?? deps.defaultLimits.dailyLimit.toString(),
  });
  const buyer = await loadBuyer(deps, buyerId);
  if (await deps.repo.getWalletByAddress(walletAddress)) {
    throw new HttpError(409, 'WALLET_TAKEN', `Wallet ${walletAddress} is already registered`);
  }
  let asset: WalletInfo;
  try {
    asset = await deps.op.getWalletAddress(walletAddress);
  } catch (err) {
    throw new HttpError(400, 'WALLET_UNREACHABLE', toWalletError(err).message);
  }
  // shortcut: two simultaneous adds of one address can both pass the check above; the unique index makes the
  // loser a 500 instead of WALLET_TAKEN.
  const wallet = await deps.repo.addWallet(buyerId, {
    walletAddress,
    publicName: asset.publicName,
    assetCode: asset.assetCode,
    assetScale: asset.assetScale,
    ...limits,
  });
  if (buyer.wallets.length === 0) await deps.repo.setDefaultWallet(buyerId, wallet.id);
  return getBuyer(deps, buyerId);
}

/** PUT /buyers/:id/default-wallet: the wallet the buyer's phone pays with. */
export async function setDefaultWallet(deps: BuyerDeps, buyerId: string, walletId: string): Promise<BuyerView> {
  const buyer = await loadBuyer(deps, buyerId);
  ownWallet(buyer, walletId);
  await deps.repo.setDefaultWallet(buyerId, walletId);
  return getBuyer(deps, buyerId);
}

/** DELETE /buyers/:id/wallets/:walletId: never the last one; removing the default makes the oldest left the default. */
export async function removeWallet(deps: BuyerDeps, buyerId: string, walletId: string): Promise<BuyerView> {
  const buyer = await loadBuyer(deps, buyerId);
  ownWallet(buyer, walletId);
  if (buyer.wallets.length === 1) throw new HttpError(409, 'LAST_WALLET', 'A buyer keeps at least one wallet');
  // shortcut: two simultaneous removals can both pass the check above and leave the buyer with no wallet; lock the
  // buyer row (SELECT ... FOR UPDATE) if removals ever stop being a manual, one-person action.
  const wasDefault = defaultWallet(buyer).id === walletId;
  await deps.repo.deleteWallet(walletId);
  if (wasDefault) await deps.repo.setDefaultWallet(buyerId, buyer.wallets.find((w) => w.id !== walletId)!.id);
  return getBuyer(deps, buyerId);
}

/**
 * POST /buyers/:id/wallets/:walletId/grant: the app's authorization screen asks for the wallet's grant, capped at
 * `amount` per day (default: the wallet's dailyLimit). The app opens redirectUrl; the wallet then sends the buyer to
 * finishUri, from where the app relays interact_ref and hash. A new start replaces an unfinished one.
 */
export async function requestWalletGrant(
  deps: GrantDeps,
  buyerId: string,
  walletId: string,
  input: { finishUri: string; amount?: string },
): Promise<GrantStart> {
  if (!URL.canParse(input.finishUri)) throw validation(`finishUri must be a URL, got ${JSON.stringify(input.finishUri)}`);
  const wallet = ownWallet(await loadBuyer(deps, buyerId), walletId);
  const dailyDebit = input.amount === undefined ? wallet.dailyLimit : parseAmount(input.amount);
  let started: Awaited<ReturnType<typeof startGrant>>;
  try {
    started = await startGrant(deps.op, wallet, { dailyDebit, finishUri: input.finishUri, now: deps.now(), timeZone: deps.timeZone });
  } catch (err) {
    throw new HttpError(502, 'GRANT_FAILED', toWalletError(err).message);
  }
  deps.pendingGrants.set(walletId, { grant: started.grant, expiresAt: deps.now().getTime() + GRANT_TTL_MS });
  return { redirectUrl: started.grant.redirect };
}

/** POST /buyers/:id/wallets/:walletId/grant/finish: one try per start, whatever the outcome. */
export async function finishWalletGrant(
  deps: GrantDeps,
  buyerId: string,
  walletId: string,
  input: { interactRef: string; hash: string },
): Promise<BuyerView> {
  ownWallet(await loadBuyer(deps, buyerId), walletId);
  const pending = deps.pendingGrants.get(walletId);
  deps.pendingGrants.delete(walletId);
  if (!pending || pending.expiresAt <= deps.now().getTime()) {
    throw new HttpError(409, 'GRANT_NOT_PENDING', `No authorization in progress for wallet ${walletId}: start it again`);
  }
  try {
    await finishGrant(deps, pending.grant, input);
  } catch (err) {
    if (err instanceof InteractionHashError) {
      throw new HttpError(400, 'GRANT_HASH_MISMATCH', "The wallet's answer did not verify: start the authorization again");
    }
    throw new HttpError(502, 'GRANT_FAILED', toWalletError(err).message);
  }
  return getBuyer(deps, buyerId);
}

/**
 * DELETE /buyers/:id/wallets/:walletId/grant: revokes the wallet's grant at the wallet, best effort, and forgets it, so
 * the app offers to authorize again. A grant the buyer already revoked in the wallet answers 401, 403 or 404.
 */
export async function revokeWalletGrant(deps: GrantDeps, buyerId: string, walletId: string): Promise<BuyerView> {
  const wallet = ownWallet(await loadBuyer(deps, buyerId), walletId);
  if (wallet.grantAccessToken && wallet.grantManageUrl) {
    try {
      await deps.op.revokeToken(wallet.grantManageUrl, wallet.grantAccessToken);
    } catch (err) {
      // Forgotten either way: the service can no longer charge with it, and the buyer can still revoke it in the wallet.
      if (!isUnauthorized(err) && toWalletError(err).status !== 404) {
        console.warn(`Could not revoke the grant of wallet ${walletId}: ${toWalletError(err).message}`);
      }
    }
  }
  await deps.repo.clearWalletGrant(walletId);
  return getBuyer(deps, buyerId);
}

/**
 * Sales that reached CHARGING and rule refusals of this buyer's wallets (FAILED, never counted toward the day);
 * BUYER_UNKNOWN refusals carry no buyer. remainingToday is the given wallet's, or the default wallet's when no wallet
 * is asked for (which also lists every wallet's sales).
 */
export async function listBuyerSales(
  deps: BuyerDeps,
  buyerId: string,
  walletId?: string,
  limit = HISTORY_SIZE,
): Promise<BuyerSales> {
  const buyer = await loadBuyer(deps, buyerId);
  const wallet = walletId === undefined ? defaultWallet(buyer) : ownWallet(buyer, walletId);
  const [spent, sales] = await Promise.all([
    spentToday(deps, wallet),
    deps.repo.listBuyerSales(buyerId, limit, walletId),
  ]);
  return {
    remainingToday: remainingToday(wallet.dailyLimit, spent).toString(),
    sales: sales.map((s) => saleView(s, s.vendorPublicName ?? s.vendorName)),
  };
}

/**
 * npm run add:buyer and the seed: a NEW buyer with `walletAddress` as the first, default wallet. Re-running with a
 * known address renames that buyer and updates the wallet's asset only, so caps and grant survive.
 */
export async function addBuyer(
  deps: Pick<Deps, 'repo' | 'op'>,
  input: { name: string; walletAddress: string; perPaymentLimit: string; dailyLimit: string },
): Promise<BuyerWithWallets> {
  if (!input.name.trim()) throw validation('name is required');
  if (!URL.canParse(input.walletAddress)) {
    throw validation(`walletAddress must be a URL, got ${JSON.stringify(input.walletAddress)}`);
  }
  const limits = parseLimits(input);
  const wallet = await deps.op.getWalletAddress(input.walletAddress);
  return deps.repo.upsertBuyerWithWallet(input.name.trim(), {
    walletAddress: input.walletAddress,
    publicName: wallet.publicName,
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
    ...limits,
  });
}

/** The scripts' --buyer: an id, an exact name or any of the buyer's wallet addresses (then that wallet too). */
export function findBuyer(
  buyers: BuyerWithWallets[],
  key: string,
): { buyer: BuyerWithWallets; wallet?: BuyerWalletRow } {
  const byId = buyers.find((b) => b.id === key) ?? buyers.find((b) => b.name === key);
  if (byId) return { buyer: byId };
  for (const buyer of buyers) {
    const wallet = buyer.wallets.find((w) => w.walletAddress === key);
    if (wallet) return { buyer, wallet };
  }
  throw new Error(`Buyer "${key}" not found (match is exact: id, name or wallet address)`);
}

/** grant:buyer authorizes one wallet: --wallet, else the wallet --buyer named, else the buyer's default. */
export function grantTarget(
  buyers: BuyerWithWallets[],
  args: { buyer: string; wallet?: string },
): { buyer: BuyerWithWallets; wallet: BuyerWalletRow } {
  const match = findBuyer(buyers, args.buyer);
  if (args.wallet === undefined) return { buyer: match.buyer, wallet: match.wallet ?? defaultWallet(match.buyer) };
  const wallet = match.buyer.wallets.find((w) => w.walletAddress === args.wallet);
  if (!wallet) throw new Error(`${args.wallet} is not a wallet of ${match.buyer.name}`);
  return { buyer: match.buyer, wallet };
}

async function view(deps: BuyerDeps, buyer: BuyerWithWallets): Promise<BuyerView> {
  const spent = await Promise.all(buyer.wallets.map(async (w) => [w.id, await spentToday(deps, w)] as const));
  return buyerView(buyer, new Map(spent));
}

function spentToday(deps: BuyerDeps, wallet: BuyerWalletRow): Promise<bigint> {
  return deps.repo.sumSpent(wallet.id, dayRange(deps.now(), deps.timeZone));
}

function parseLimits(input: { perPaymentLimit: string; dailyLimit: string }): Limits {
  const perPaymentLimit = parseAmount(input.perPaymentLimit, 'perPaymentLimit');
  const dailyLimit = parseAmount(input.dailyLimit, 'dailyLimit');
  if (perPaymentLimit > dailyLimit) throw validation('perPaymentLimit must be ≤ dailyLimit');
  return { perPaymentLimit, dailyLimit };
}

export function ownWallet(buyer: BuyerWithWallets, walletId: string): BuyerWalletRow {
  const wallet = buyer.wallets.find((w) => w.id === walletId);
  if (!wallet) throw new HttpError(404, 'WALLET_NOT_FOUND', `Wallet ${walletId} not found for buyer ${buyer.id}`);
  return wallet;
}

export async function loadBuyer(deps: Pick<Deps, 'repo'>, id: string): Promise<BuyerWithWallets> {
  const buyer = await deps.repo.getBuyer(id);
  if (!buyer) throw new HttpError(404, 'BUYER_NOT_FOUND', `Buyer ${id} not found`);
  return buyer;
}
