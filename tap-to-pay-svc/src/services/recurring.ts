import type { RecurringView, SaleStatus, SaleView } from '../contracts.js';
import type { RecurringRow } from '../db/repos.js';
import { toWalletError } from '../open-payments/types.js';
import { billerWallet, findBiller } from './billers.js';
import { loadBuyer, ownWallet } from './buyers.js';
import { HttpError, validation } from './errors.js';
import { localDate, localInstant } from './limits.js';
import { formatAmount } from './money.js';
import { chargeSale, createSale, type Deps } from './sales.js';
import { defaultWallet } from './views.js';

// Recurring payments: a buyer enrols once in a monthly payment to a service (a catalog biller or any Interledger
// wallet), and each month the service charges it on the chosen day. A run is an ordinary sale to the payee's vendor,
// charged with chargeSale, so the paying wallet's grant and caps apply exactly as for a tap.

const RUN_HOUR = 8; // local time, DAILY_LIMIT_TZ
const NAME_MAX = 60;
const REFERENCE_MAX = 40;

export type RecurringInput = {
  /** A catalog biller (epm, claro, …), or else payeeName and payeeWalletAddress. */
  billerId?: string;
  payeeName?: string;
  payeeWalletAddress?: string;
  reference?: string;
  /** In whole units of the payee's asset, decimals allowed up to its scale: "45000", "45000.50". */
  amount: string;
  /** 1 to 28. */
  dayOfMonth: number;
  /** One of the buyer's wallets; the default one pays when left out. */
  walletId?: string;
};

export async function listRecurring(deps: Deps, buyerId: string): Promise<RecurringView[]> {
  await loadBuyer(deps, buyerId);
  return (await deps.repo.listRecurring(buyerId)).map(recurringView);
}

/** POST /buyers/:id/recurring: the payee is resolved live, so its asset prices the amount. */
export async function addRecurring(deps: Deps, buyerId: string, input: RecurringInput): Promise<RecurringView> {
  const buyer = await loadBuyer(deps, buyerId);
  if (input.walletId !== undefined) ownWallet(buyer, input.walletId);
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28) {
    throw validation('dayOfMonth must be between 1 and 28');
  }
  const reference = input.reference?.trim() || null;
  if (reference && reference.length > REFERENCE_MAX) {
    throw validation(`reference must be at most ${REFERENCE_MAX} characters`);
  }

  let payeeName: string;
  let payeeWalletAddress: string;
  if (input.billerId !== undefined) {
    const biller = findBiller(input.billerId);
    if (!biller) throw new HttpError(404, 'BILLER_NOT_FOUND', `Biller ${input.billerId} not found`);
    const wallet = billerWallet(deps, biller.id);
    if (!wallet) throw new HttpError(409, 'BILLER_UNAVAILABLE', `No wallet is configured for ${biller.name}`);
    payeeName = biller.name;
    payeeWalletAddress = wallet;
  } else {
    payeeName = input.payeeName?.trim() ?? '';
    if (!payeeName) throw validation('payeeName is required without billerId');
    if (payeeName.length > NAME_MAX) throw validation(`payeeName must be at most ${NAME_MAX} characters`);
    if (!input.payeeWalletAddress) throw validation('payeeWalletAddress is required without billerId');
    payeeWalletAddress = input.payeeWalletAddress;
  }

  let asset;
  try {
    asset = await deps.op.getWalletAddress(payeeWalletAddress);
  } catch (err) {
    throw new HttpError(400, 'WALLET_UNREACHABLE', toWalletError(err).message);
  }
  const amount = parseDecimal(input.amount, asset.assetScale);

  const row = await deps.repo.createRecurring({
    buyerId,
    walletId: input.walletId ?? null,
    billerId: input.billerId ?? null,
    payeeName,
    payeeWalletAddress,
    payeeAssetCode: asset.assetCode,
    payeeAssetScale: asset.assetScale,
    reference,
    amount,
    dayOfMonth: input.dayOfMonth,
    nextRunAt: nextRun(deps, input.dayOfMonth),
  });
  return recurringView(row);
}

/** Pausing keeps the enrolment; resuming schedules the next run from now, never a missed one. */
export async function setRecurringActive(
  deps: Deps,
  buyerId: string,
  id: string,
  active: boolean,
): Promise<RecurringView> {
  const row = await loadRecurring(deps, buyerId, id);
  const patch = active && !row.active ? { active, nextRunAt: nextRun(deps, row.dayOfMonth) } : { active };
  return recurringView(await deps.repo.updateRecurring(id, patch));
}

export async function removeRecurring(deps: Deps, buyerId: string, id: string): Promise<void> {
  await loadRecurring(deps, buyerId, id);
  await deps.repo.deleteRecurring(id);
}

/** POST /buyers/:id/recurring/:rid/pay: a run now, outside the schedule, which stays as it was. */
export async function payRecurringNow(deps: Deps, buyerId: string, id: string): Promise<SaleView> {
  return runPayment(deps, await loadRecurring(deps, buyerId, id));
}

/**
 * The scheduler's tick: every active payment whose day has come runs once. The claim moves nextRunAt to next month
 * before the charge, so two ticks (or two service instances) never charge the same month twice. A failed run is
 * recorded and waits for next month or a "pay now".
 */
export async function runDueRecurring(deps: Deps): Promise<number> {
  const now = deps.now();
  let ran = 0;
  for (const row of await deps.repo.listDueRecurring(now)) {
    if (!(await deps.repo.claimRecurringRun(row.id, row.nextRunAt, nextRun(deps, row.dayOfMonth)))) continue;
    ran++;
    try {
      const sale = await runPayment(deps, row);
      console.log(`recurring ${row.id} (${row.payeeName}): ${sale.status}`);
    } catch (err) {
      console.warn(`recurring ${row.id} (${row.payeeName}) failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return ran;
}

async function runPayment(deps: Deps, row: RecurringRow): Promise<SaleView> {
  const buyer = await loadBuyer(deps, row.buyerId);
  const payer = buyer.wallets.find((w) => w.id === row.walletId) ?? defaultWallet(buyer);
  try {
    const vendor = await deps.repo.ensureBillerVendor(row.payeeName, {
      walletAddress: row.payeeWalletAddress,
      publicName: null,
      assetCode: row.payeeAssetCode,
      assetScale: row.payeeAssetScale,
    });
    const receiving = vendor.wallets.find((w) => w.walletAddress === row.payeeWalletAddress)!;
    const description = [row.payeeName, row.reference, 'pago recurrente'].filter(Boolean).join(' · ').slice(0, 140);
    const sale = await createSale(deps, vendor.id, row.amount.toString(), receiving.id, description);
    const charged = await chargeSale(deps, sale.id, payer.walletAddress, 'RECURRING');
    await deps.repo.updateRecurring(row.id, {
      lastRunAt: deps.now(),
      lastSaleId: charged.id,
      lastStatus: charged.status,
      lastMessage: charged.failureMessage,
    });
    return charged;
  } catch (err) {
    await deps.repo.updateRecurring(row.id, {
      lastRunAt: deps.now(),
      lastStatus: 'FAILED',
      lastMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** The next RUN_HOUR local on `dayOfMonth` that is still ahead of now: this month's, else next month's. */
export function nextRun(deps: Pick<Deps, 'now' | 'timeZone'>, dayOfMonth: number): Date {
  const now = deps.now();
  const { year, month } = localDate(now, deps.timeZone);
  const thisMonth = localInstant(year, month, dayOfMonth, RUN_HOUR, deps.timeZone);
  return thisMonth > now ? thisMonth : localInstant(year, month + 1, dayOfMonth, RUN_HOUR, deps.timeZone);
}

/** "45000" or "45000.50" (or with a comma) in whole units to the smallest unit; no thousands separators. */
export function parseDecimal(input: string, scale: number): bigint {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(input.trim());
  if (!match) throw validation(`amount must be a number like 45000 or 45000.50, got ${JSON.stringify(input)}`);
  const [, whole, fraction = ''] = match;
  if (fraction.length > scale) throw validation(`amount allows at most ${scale} decimals`);
  const value = BigInt(whole + fraction.padEnd(scale, '0'));
  if (value <= 0n) throw validation('amount must be greater than zero');
  return value;
}

async function loadRecurring(deps: Deps, buyerId: string, id: string): Promise<RecurringRow> {
  const row = await deps.repo.getRecurring(id);
  if (!row || row.buyerId !== buyerId) {
    throw new HttpError(404, 'RECURRING_NOT_FOUND', `Recurring payment ${id} not found for buyer ${buyerId}`);
  }
  return row;
}

function recurringView(row: RecurringRow): RecurringView {
  return {
    id: row.id,
    billerId: row.billerId,
    payeeName: row.payeeName,
    payeeWalletAddress: row.payeeWalletAddress,
    reference: row.reference,
    amount: row.amount.toString(),
    amountFormatted: formatAmount(row.amount, row.payeeAssetScale),
    assetCode: row.payeeAssetCode,
    assetScale: row.payeeAssetScale,
    dayOfMonth: row.dayOfMonth,
    walletId: row.walletId,
    active: row.active,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastSaleId: row.lastSaleId,
    lastStatus: row.lastStatus as SaleStatus | null,
    lastMessage: row.lastMessage,
  };
}
