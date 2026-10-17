import type { BuyerView, BuyerWalletView, SaleView, VendorView } from '../contracts.js';
import type { BuyerWalletRow, BuyerWithWallets, SaleRow, VendorWithWallets } from '../db/repos.js';
import { remainingToday } from './limits.js';
import { formatAmount } from './money.js';

/** Wallet URLs and grant tokens never leave the service. */
export function saleView(sale: SaleRow, vendorName?: string): SaleView {
  return {
    id: sale.id,
    vendorId: sale.vendorId,
    ...(vendorName === undefined ? {} : { vendorName }),
    vendorWalletId: sale.vendorWalletId,
    buyerId: sale.buyerId,
    buyerWalletId: sale.buyerWalletId,
    amount: sale.amount.toString(),
    amountFormatted: formatAmount(sale.amount, sale.assetScale),
    assetCode: sale.assetCode,
    assetScale: sale.assetScale,
    status: sale.status,
    debitAmount: sale.debitAmount === null ? null : sale.debitAmount.toString(),
    debitAmountFormatted:
      sale.debitAmount === null || sale.debitAssetScale === null
        ? null
        : formatAmount(sale.debitAmount, sale.debitAssetScale),
    debitAssetCode: sale.debitAssetCode,
    debitAssetScale: sale.debitAssetScale,
    failureCode: sale.failureCode,
    failureMessage: sale.failureMessage,
    description: sale.description,
    chargedVia: sale.chargedVia as SaleView['chargedVia'],
    createdAt: sale.createdAt.toISOString(),
    paidAt: sale.paidAt ? sale.paidAt.toISOString() : null,
  };
}

export function buyerWalletView(wallet: BuyerWalletRow, spentToday: bigint, isDefault: boolean): BuyerWalletView {
  return {
    id: wallet.id,
    walletAddress: wallet.walletAddress,
    publicName: wallet.publicName,
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
    perPaymentLimit: wallet.perPaymentLimit.toString(),
    dailyLimit: wallet.dailyLimit.toString(),
    spentToday: spentToday.toString(),
    remainingToday: remainingToday(wallet.dailyLimit, spentToday).toString(),
    hasGrant: wallet.grantAccessToken !== null,
    grantDailyLimit: wallet.grantDailyLimit == null ? null : wallet.grantDailyLimit.toString(),
    grantRemainingToday:
      wallet.grantDailyLimit == null ? null : remainingToday(wallet.grantDailyLimit, spentToday).toString(),
    isDefault,
  };
}

/** A buyer's or vendor's default wallet; the oldest one if defaultWalletId is unset or stale. */
export function defaultWallet<W extends { id: string }>(owner: {
  id: string;
  defaultWalletId: string | null;
  wallets: W[];
}): W {
  const wallet = owner.wallets.find((w) => w.id === owner.defaultWalletId) ?? owner.wallets[0];
  if (!wallet) throw new Error(`${owner.id} has no wallet`);
  return wallet;
}

/**
 * `spentToday` is keyed by wallet id. The default wallet's fields are repeated at the top level (SDD section 9), and
 * its publicName names the buyer when it has one.
 */
export function buyerView(buyer: BuyerWithWallets, spentToday: Map<string, bigint>): BuyerView {
  const main = defaultWallet(buyer);
  const wallets = buyer.wallets.map((w) => buyerWalletView(w, spentToday.get(w.id) ?? 0n, w.id === main.id));
  const { id: defaultWalletId, isDefault: _isDefault, ...defaults } = wallets.find((w) => w.id === main.id)!;
  return { ...defaults, id: buyer.id, name: main.publicName ?? buyer.name, defaultWalletId, wallets };
}

/** The default wallet's address and asset are repeated at the top level (SDD section 9); its publicName names the vendor. */
export function vendorView(vendor: VendorWithWallets): VendorView {
  const main = defaultWallet(vendor);
  return {
    id: vendor.id,
    name: main.publicName ?? vendor.name,
    defaultWalletId: main.id,
    walletAddress: main.walletAddress,
    publicName: main.publicName,
    assetCode: main.assetCode,
    assetScale: main.assetScale,
    wallets: vendor.wallets.map((w) => ({
      id: w.id,
      walletAddress: w.walletAddress,
      publicName: w.publicName,
      assetCode: w.assetCode,
      assetScale: w.assetScale,
      isDefault: w.id === main.id,
    })),
  };
}
