import type { RecurringView, SaleStatus, SaleView, VendorPayerView } from '../contracts.js';
import type { BuyerWithWallets, RecurringRow, VendorWithWallets } from '../db/repos.js';
import { toWalletError } from '../open-payments/types.js';
import { billerWallet, findBiller } from './billers.js';
import { ownWallet } from './buyers.js';
import { HttpError, validation } from './errors.js';
import { localDate, localInstant } from './limits.js';
import { formatAmount } from './money.js';
import { chargeSale, createSale, type Deps } from './sales.js';
import { defaultWallet } from './views.js';

// Recurring payments: a vendor enrols once in a monthly payment to a service (a catalog biller or any Interledger
// wallet), and each month the service pays it on the chosen day. Paying its bills on time, month after month, is the
// payment history the monthly statement shows a lender.
//
// Money leaves the vendor's own wallet, and Open Payments needs a grant for that: the vendor gets a payer identity, a
// buyer holding the vendor's wallet addresses, authorized once with npm run grant:buyer. Each run is then an ordinary
// sale to the payee's vendor, charged with chargeSale, so the grant and the payer wallet's caps apply as for a tap.

const RUN_HOUR = 8; // local time, DAILY_LIMIT_TZ
const NAME_MAX = 60;
const REFERENCE_MAX = 40;
// shortcut: the payer wallets' own caps are left open; what bounds a vendor's bills is the debit limit of the grant it
// approved in its wallet (grant:buyer --amount). Add caps to the vendor app before real users.
const PAYER_CAP = 1_000_000_000_000n;

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
  /** One of the vendor's payer wallets; the default one pays when left out. */
  walletId?: string;
};

/** GET /vendors/:id/payer: the vendor's payer identity, created on first use, with every vendor wallet in it. */
export async function getVendorPayer(deps: Deps, vendorId: string): Promise<VendorPayerView> {
  const payer = await ensurePayer(deps, await loadVendor(deps, vendorId));
  return payerView(payer);
}

export async function listRecurring(deps: Deps, vendorId: string): Promise<RecurringView[]> {
  await loadVendor(deps, vendorId);
  return (await deps.repo.listRecurring(vendorId)).map(recurringView);
}

/** POST /vendors/:id/recurring: the payee is resolved live, so its asset prices the amount. */
export async function addRecurring(deps: Deps, vendorId: string, input: RecurringInput): Promise<RecurringView> {
  const vendor = await loadVendor(deps, vendorId);
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
  if (vendor.wallets.some((w) => w.walletAddress === payeeWalletAddress)) {
    throw validation('A vendor cannot pay one of its own wallets');
  }

  const payer = await ensurePayer(deps, vendor);
  if (input.walletId !== undefined) ownWallet(payer, input.walletId);
  let asset;
  try {
    asset = await deps.op.getWalletAddress(payeeWalletAddress);
  } catch (err) {
    throw new HttpError(400, 'WALLET_UNREACHABLE', toWalletError(err).message);
  }
  const amount = parseDecimal(input.amount, asset.assetScale);

  const row = await deps.repo.createRecurring({
    vendorId,
    buyerId: payer.id,
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
  vendorId: string,
  id: string,
  active: boolean,
): Promise<RecurringView> {
  const row = await loadRecurring(deps, vendorId, id);
  const patch = active && !row.active ? { active, nextRunAt: nextRun(deps, row.dayOfMonth) } : { active };
  return recurringView(await deps.repo.updateRecurring(id, patch));
}

export async function removeRecurring(deps: Deps, vendorId: string, id: string): Promise<void> {
  await loadRecurring(deps, vendorId, id);
  await deps.repo.deleteRecurring(id);
}

/** POST /vendors/:id/recurring/:rid/pay: a run now, outside the schedule, which stays as it was. */
export async function payRecurringNow(deps: Deps, vendorId: string, id: string): Promise<SaleView> {
  return runPayment(deps, await loadRecurring(deps, vendorId, id));
}

/**
 * The scheduler's tick: every active payment whose day has come runs once. The claim moves nextRunAt to next month
 * before the charge, so two ticks (or two service instances) never charge the same month twice. A failed run is
 * recorded, counts as a missed payment in the statement, and waits for next month or a "pay now".
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
  const payer = await deps.repo.getBuyer(row.buyerId);
  if (!payer || payer.wallets.length === 0) throw new Error(`Payer ${row.buyerId} has no wallet`);
  const wallet = payer.wallets.find((w) => w.id === row.walletId) ?? defaultWallet(payer);
  try {
    const biller = await deps.repo.ensureBillerVendor(row.payeeName, {
      walletAddress: row.payeeWalletAddress,
      publicName: null,
      assetCode: row.payeeAssetCode,
      assetScale: row.payeeAssetScale,
    });
    const receiving = biller.wallets.find((w) => w.walletAddress === row.payeeWalletAddress)!;
    const description = [row.payeeName, row.reference, 'pago recurrente'].filter(Boolean).join(' · ').slice(0, 140);
    const sale = await createSale(deps, biller.id, row.amount.toString(), receiving.id, description);
    const charged = await chargeSale(deps, sale.id, wallet.walletAddress, 'RECURRING');
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

/**
 * The vendor's payer identity, every vendor wallet in it. Created on first use and linked from the vendor; a wallet
 * address already registered as some buyer's wallet makes that buyer the payer (it is the same wallet, and its grant).
 */
export async function ensurePayer(deps: Pick<Deps, 'repo'>, vendor: VendorWithWallets): Promise<BuyerWithWallets> {
  let payer = vendor.payerBuyerId ? await deps.repo.getBuyer(vendor.payerBuyerId) : null;
  for (const w of vendor.wallets) {
    if (payer?.wallets.some((pw) => pw.walletAddress === w.walletAddress)) continue;
    const owned = await deps.repo.getWalletByAddress(w.walletAddress);
    if (owned) {
      payer ??= await deps.repo.getBuyer(owned.buyerId);
      continue;
    }
    const wallet = {
      walletAddress: w.walletAddress,
      publicName: w.publicName,
      assetCode: w.assetCode,
      assetScale: w.assetScale,
      perPaymentLimit: PAYER_CAP,
      dailyLimit: PAYER_CAP,
    };
    if (payer) {
      await deps.repo.addWallet(payer.id, wallet);
      payer = await deps.repo.getBuyer(payer.id);
    } else {
      payer = await deps.repo.upsertBuyerWithWallet(`${vendor.name} · pagos`, wallet);
    }
  }
  if (!payer) throw new Error(`Vendor ${vendor.id} has no wallet`);
  if (vendor.payerBuyerId !== payer.id) await deps.repo.setVendorPayer(vendor.id, payer.id);
  return payer;
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

async function loadVendor(deps: Pick<Deps, 'repo'>, vendorId: string): Promise<VendorWithWallets> {
  const vendor = await deps.repo.getVendor(vendorId);
  if (!vendor) throw new HttpError(404, 'VENDOR_NOT_FOUND', `Vendor ${vendorId} not found`);
  return vendor;
}

async function loadRecurring(deps: Deps, vendorId: string, id: string): Promise<RecurringRow> {
  const row = await deps.repo.getRecurring(id);
  if (!row || row.vendorId !== vendorId) {
    throw new HttpError(404, 'RECURRING_NOT_FOUND', `Recurring payment ${id} not found for vendor ${vendorId}`);
  }
  return row;
}

function payerView(payer: BuyerWithWallets): VendorPayerView {
  return {
    buyerId: payer.id,
    wallets: payer.wallets.map((w) => ({
      id: w.id,
      walletAddress: w.walletAddress,
      publicName: w.publicName,
      assetCode: w.assetCode,
      assetScale: w.assetScale,
      hasGrant: w.grantAccessToken !== null,
      isDefault: w.id === (payer.defaultWalletId ?? payer.wallets[0]?.id),
      grantCommand: `npm run grant:buyer -- --buyer ${w.walletAddress}`,
    })),
  };
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
