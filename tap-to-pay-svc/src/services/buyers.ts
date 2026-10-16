import type { BuyerSales, BuyerView } from '../contracts.js';
import type { BuyerRow } from '../db/repos.js';
import { HttpError, validation } from './errors.js';
import { dayRange, remainingToday } from './limits.js';
import { parseAmount } from './money.js';
import type { Deps } from './sales.js';
import { buyerView, saleView } from './views.js';

type BuyerDeps = Pick<Deps, 'repo' | 'now' | 'timeZone'>;

const HISTORY_SIZE = 20;

export async function listBuyerViews(deps: BuyerDeps): Promise<BuyerView[]> {
  const buyers = await deps.repo.listBuyers();
  return Promise.all(buyers.map(async (b) => buyerView(b, await spentToday(deps, b))));
}

export async function getBuyer(deps: BuyerDeps, id: string): Promise<BuyerView> {
  const buyer = await loadBuyer(deps, id);
  return buyerView(buyer, await spentToday(deps, buyer));
}

/** Limits are enforced by the service alone, so changing them never needs a new grant. */
export async function updateLimits(
  deps: BuyerDeps,
  id: string,
  input: { perPaymentLimit: string; dailyLimit: string },
): Promise<BuyerView> {
  const perPaymentLimit = parseAmount(input.perPaymentLimit, 'perPaymentLimit');
  const dailyLimit = parseAmount(input.dailyLimit, 'dailyLimit');
  if (perPaymentLimit > dailyLimit) throw validation('perPaymentLimit must be ≤ dailyLimit');
  await loadBuyer(deps, id);
  const buyer = await deps.repo.updateBuyerLimits(id, { perPaymentLimit, dailyLimit });
  return buyerView(buyer, await spentToday(deps, buyer));
}

/** Only sales that reached CHARGING carry a buyerId, so rule refusals never appear here. */
export async function listBuyerSales(deps: BuyerDeps, id: string): Promise<BuyerSales> {
  const buyer = await loadBuyer(deps, id);
  const [spent, sales] = await Promise.all([
    spentToday(deps, buyer),
    deps.repo.listBuyerSales(id, HISTORY_SIZE),
  ]);
  return {
    remainingToday: remainingToday(buyer.dailyLimit, spent).toString(),
    sales: sales.map((s) => saleView(s, s.vendorName)),
  };
}

function spentToday(deps: BuyerDeps, buyer: BuyerRow): Promise<bigint> {
  return deps.repo.sumSpent(buyer.id, dayRange(deps.now(), deps.timeZone));
}

async function loadBuyer(deps: BuyerDeps, id: string): Promise<BuyerRow> {
  const buyer = await deps.repo.getBuyer(id);
  if (!buyer) throw new HttpError(404, 'BUYER_NOT_FOUND', `Buyer ${id} not found`);
  return buyer;
}
