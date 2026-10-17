import type { SaleView } from '../contracts.js';
import type { BuyerWalletRow, Limits, Repo, SaleRow } from '../db/repos.js';
import {
  isClientError,
  isUnauthorized,
  toWalletError,
  type OpenPayments,
  type Quote,
  type WalletInfo,
} from '../open-payments/types.js';
import { HttpError } from './errors.js';
import { checkLimits, checkWallet, dayRange, sameAsset, type ChargeCheck } from './limits.js';
import { parseAmount, toAmount } from './money.js';
import { ownVendorWallet } from './vendors.js';
import { defaultWallet, saleView } from './views.js';

export type Deps = {
  repo: Repo;
  op: OpenPayments;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  timeZone: string;
  pollSeconds: number;
  /** Caps a wallet added through the API starts with (SEED_PER_PAYMENT_LIMIT, SEED_DAILY_LIMIT). */
  defaultLimits: Limits;
};

/** POST /sales: received into `walletId`, one of the vendor's wallets, else the default one, and priced in its asset. */
export async function createSale(
  deps: Deps,
  vendorId: string,
  amountInput: string,
  walletId?: string,
): Promise<SaleView> {
  const amount = parseAmount(amountInput);
  const vendor = await deps.repo.getVendor(vendorId);
  if (!vendor) throw new HttpError(404, 'VENDOR_NOT_FOUND', `Vendor ${vendorId} not found`);
  const wallet = walletId === undefined ? defaultWallet(vendor) : ownVendorWallet(vendor, walletId);
  const sale = await deps.repo.createSale({
    vendorId,
    vendorWalletId: wallet.id,
    amount,
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
    createdAt: deps.now(),
  });
  return saleView(sale, wallet.publicName ?? vendor.name);
}

/** The per-sale orchestration of SDD section 10, steps 3 to 9. */
export async function chargeSale(deps: Deps, saleId: string, walletAddress: string): Promise<SaleView> {
  const { repo, op } = deps;

  // 3. The sale and the paying wallet, whichever buyer owns it.
  const sale = await loadSale(repo, saleId);
  if (sale.status !== 'AWAITING_TAP') {
    throw new HttpError(409, 'SALE_NOT_CHARGEABLE', `Sale is ${sale.status}`);
  }
  // shortcut: the card answers a fixed address, so a forged card can charge it within its limits.
  const wallet = await repo.getWalletByAddress(walletAddress);

  // 4. The rules, all on that wallet: card and grant always come before any wallet call; so do the caps when
  // both wallets share an asset. In another asset the caps wait for the quote, which knows the debit.
  const walletCheck = checkWallet(wallet);
  if (!walletCheck.ok) return refuse(repo, saleId, walletCheck, wallet);
  const payer = wallet!;
  const spentToday = await repo.sumSpent(payer.id, dayRange(deps.now(), deps.timeZone));
  const crossAsset = !sameAsset(payer, sale);
  if (!crossAsset) {
    const limits = checkLimits(payer, sale.amount, spentToday);
    if (!limits.ok) return refuse(repo, saleId, limits, payer);
  }

  // 5. The claim. From here the debit counts toward that wallet's day (a cross-asset one once quoted).
  // shortcut: the sum above runs outside a lock, so two sales at the same instant can both pass the cap.
  let current = await repo.transitionSale(saleId, 'AWAITING_TAP', {
    status: 'CHARGING',
    buyerId: payer.buyerId,
    buyerWalletId: payer.id,
    ...(crossAsset
      ? {}
      : { debitAmount: sale.amount, debitAssetCode: sale.assetCode, debitAssetScale: sale.assetScale }),
  });
  if (!current) throw alreadyTaken();
  const fail = (err: unknown) => failSale(deps, saleId, err);

  // 6 and 7. Incoming payment on the sale's receiving wallet, quote on the buyer's.
  let buyerWallet: WalletInfo;
  let quote: Quote;
  try {
    const vendor = await repo.getVendor(sale.vendorId);
    if (!vendor) throw new Error(`Vendor ${sale.vendorId} not found`);
    const receiving = vendor.wallets.find((w) => w.id === sale.vendorWalletId);
    if (!receiving) throw new Error('Receiving wallet was removed');
    const vendorWallet = await op.getWalletAddress(receiving.walletAddress);
    buyerWallet = await op.getWalletAddress(payer.walletAddress);
    const incomingPaymentUrl = await op.createIncomingPayment(
      vendorWallet,
      toAmount(sale.amount, sale.assetCode, sale.assetScale),
    );
    current = await repo.updateSale(saleId, { incomingPaymentUrl });
    quote = await op.createQuote(buyerWallet, incomingPaymentUrl);
    current = await repo.updateSale(saleId, { quoteId: quote.id });
  } catch (err) {
    return fail(err);
  }

  // 7b. Cross-asset: the caps against what the quote debits, still before any money moves.
  if (crossAsset) {
    const limits = checkLimits(payer, quote.debitAmount, spentToday);
    if (!limits.ok) {
      const failed = await repo.transitionSale(saleId, 'CHARGING', {
        status: 'FAILED',
        failureCode: limits.code,
        failureMessage: limits.message,
      });
      return saleView(failed ?? current);
    }
    try {
      current = await repo.updateSale(saleId, {
        debitAmount: quote.debitAmount,
        debitAssetCode: quote.assetCode,
        debitAssetScale: quote.assetScale,
      });
    } catch (err) {
      return fail(err);
    }
  }
  const quoteId = quote.id;

  // 8. The payment, rotating the stored token once on 401 or 403.
  let outgoingPaymentUrl: string;
  try {
    try {
      outgoingPaymentUrl = await op.createOutgoingPayment(buyerWallet, quoteId, payer.grantAccessToken!);
    } catch (err) {
      if (!isUnauthorized(err)) throw err;
      let token: string;
      try {
        const rotated = await op.rotateToken(payer.grantManageUrl!, payer.grantAccessToken!);
        await repo.updateWalletGrant(payer.id, {
          grantAccessToken: rotated.value,
          grantManageUrl: rotated.manage,
        });
        token = rotated.value;
      } catch (rotateErr) {
        return fail(rotateErr);
      }
      outgoingPaymentUrl = await op.createOutgoingPayment(buyerWallet, quoteId, token);
    }
  } catch (err) {
    if (isClientError(err)) return fail(err);
    // A timeout, a dropped connection or a 5xx: the payment may exist, so the sale stays CHARGING.
    console.warn(`sale ${saleId}: outgoing payment unconfirmed: ${toWalletError(err).message}`);
    return saleView(current);
  }
  current = await repo.updateSale(saleId, { outgoingPaymentUrl });

  // 9. Confirmation.
  return saleView(await waitForPayment(deps, current, deps.pollSeconds));
}

/** GET /sales/:id: a CHARGING sale is re-checked against the vendor's wallet first. */
export async function refreshSale(deps: Deps, saleId: string): Promise<SaleView> {
  const sale = await loadSale(deps.repo, saleId);
  if (sale.status !== 'CHARGING') return saleView(sale);
  return saleView(await waitForPayment(deps, sale, 1));
}

/** Reads the incoming payment up to `attempts` times, one second apart. Never fails the sale. */
async function waitForPayment(deps: Deps, sale: SaleRow, attempts: number): Promise<SaleRow> {
  if (!sale.incomingPaymentUrl) return sale;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await deps.sleep(1000);
    let received: bigint;
    try {
      ({ receivedAmount: received } = await deps.op.getIncomingPayment(sale.incomingPaymentUrl));
    } catch (err) {
      console.warn(`sale ${sale.id}: could not read the incoming payment: ${toWalletError(err).message}`);
      return sale;
    }
    // Completion is decided by receivedAmount: the public view never reports `completed`.
    if (received >= sale.amount) {
      return deps.repo.updateSale(sale.id, { status: 'PAID', paidAt: deps.now() });
    }
  }
  return sale;
}

async function failSale(deps: Deps, saleId: string, err: unknown): Promise<SaleView> {
  const message = toWalletError(err).message;
  const failed = await deps.repo.transitionSale(saleId, 'CHARGING', {
    status: 'FAILED',
    failureCode: 'WALLET_ERROR',
    failureMessage: message,
  });
  return saleView(failed ?? (await loadSale(deps.repo, saleId)));
}

/**
 * A rule refused before the claim: no wallet call was made and nothing counts toward the day (no debit, and the sums
 * only count CHARGING and PAID). A known payer is recorded so the refusal reaches their history; BUYER_UNKNOWN has none.
 */
async function refuse(
  repo: Repo,
  saleId: string,
  check: ChargeCheck & { ok: false },
  payer: BuyerWalletRow | null,
): Promise<SaleView> {
  const failed = await repo.transitionSale(saleId, 'AWAITING_TAP', {
    status: 'FAILED',
    failureCode: check.code,
    failureMessage: check.message,
    ...(payer && { buyerId: payer.buyerId, buyerWalletId: payer.id }),
  });
  if (!failed) throw alreadyTaken();
  return saleView(failed);
}

async function loadSale(repo: Repo, saleId: string): Promise<SaleRow> {
  const sale = await repo.getSale(saleId);
  if (!sale) throw new HttpError(404, 'SALE_NOT_FOUND', `Sale ${saleId} not found`);
  return sale;
}

const alreadyTaken = () => new HttpError(409, 'SALE_NOT_CHARGEABLE', 'Sale was already taken');
