import type { SaleView } from '../contracts.js';
import type { Repo, SaleRow } from '../db/repos.js';
import {
  isClientError,
  isUnauthorized,
  toWalletError,
  type OpenPayments,
  type WalletInfo,
} from '../open-payments/types.js';
import { HttpError } from './errors.js';
import { canCharge, dayRange } from './limits.js';
import { parseAmount, toAmount } from './money.js';
import { saleView } from './views.js';

export type Deps = {
  repo: Repo;
  op: OpenPayments;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  timeZone: string;
  pollSeconds: number;
};

export async function createSale(deps: Deps, vendorId: string, amountInput: string): Promise<SaleView> {
  const amount = parseAmount(amountInput);
  const vendor = await deps.repo.getVendor(vendorId);
  if (!vendor) throw new HttpError(404, 'VENDOR_NOT_FOUND', `Vendor ${vendorId} not found`);
  const sale = await deps.repo.createSale({
    vendorId,
    amount,
    assetCode: vendor.assetCode,
    assetScale: vendor.assetScale,
    createdAt: deps.now(),
  });
  return saleView(sale, vendor.name);
}

/** The per-sale orchestration of SDD section 10, steps 3 to 9. */
export async function chargeSale(deps: Deps, saleId: string, walletAddress: string): Promise<SaleView> {
  const { repo, op } = deps;

  // 3. The sale and the buyer.
  const sale = await loadSale(repo, saleId);
  if (sale.status !== 'AWAITING_TAP') {
    throw new HttpError(409, 'SALE_NOT_CHARGEABLE', `Sale is ${sale.status}`);
  }
  // shortcut: the card answers a fixed address, so a forged card can charge it within its limits.
  const buyer = await repo.getBuyerByWallet(walletAddress);

  // 4. The rules, before any wallet call.
  const spentToday = buyer ? await repo.sumSpent(buyer.id, dayRange(deps.now(), deps.timeZone)) : 0n;
  const check = canCharge(buyer, sale, spentToday);
  if (!check.ok) {
    const failed = await repo.transitionSale(saleId, 'AWAITING_TAP', {
      status: 'FAILED',
      failureCode: check.code,
      failureMessage: check.message,
    });
    if (!failed) throw alreadyTaken();
    return saleView(failed);
  }

  // 5. The claim. From here the amount counts toward the buyer's day.
  // shortcut: the sum above runs outside a lock, so two sales at the same instant can both pass the cap.
  let current = await repo.transitionSale(saleId, 'AWAITING_TAP', { status: 'CHARGING', buyerId: buyer!.id });
  if (!current) throw alreadyTaken();
  const payer = buyer!;
  const fail = (err: unknown) => failSale(deps, saleId, err);

  // 6 and 7. Incoming payment on the vendor's wallet, quote on the buyer's.
  let buyerWallet: WalletInfo;
  let quoteId: string;
  try {
    const vendor = await repo.getVendor(sale.vendorId);
    if (!vendor) throw new Error(`Vendor ${sale.vendorId} not found`);
    const vendorWallet = await op.getWalletAddress(vendor.walletAddress);
    buyerWallet = await op.getWalletAddress(payer.walletAddress);
    const incomingPaymentUrl = await op.createIncomingPayment(
      vendorWallet,
      toAmount(sale.amount, sale.assetCode, sale.assetScale),
    );
    current = await repo.updateSale(saleId, { incomingPaymentUrl });
    quoteId = await op.createQuote(buyerWallet, incomingPaymentUrl);
    current = await repo.updateSale(saleId, { quoteId });
  } catch (err) {
    return fail(err);
  }

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
        await repo.updateBuyerGrant(payer.id, {
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

async function loadSale(repo: Repo, saleId: string): Promise<SaleRow> {
  const sale = await repo.getSale(saleId);
  if (!sale) throw new HttpError(404, 'SALE_NOT_FOUND', `Sale ${saleId} not found`);
  return sale;
}

const alreadyTaken = () => new HttpError(409, 'SALE_NOT_CHARGEABLE', 'Sale was already taken');
