import type { BuyerView, SaleView, VendorView } from '../contracts.js';
import type { BuyerRow, SaleRow, VendorRow } from '../db/repos.js';
import { remainingToday } from './limits.js';
import { formatAmount } from './money.js';

/** Wallet URLs and grant tokens never leave the service. */
export function saleView(sale: SaleRow, vendorName?: string): SaleView {
  return {
    id: sale.id,
    vendorId: sale.vendorId,
    ...(vendorName === undefined ? {} : { vendorName }),
    buyerId: sale.buyerId,
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
    createdAt: sale.createdAt.toISOString(),
    paidAt: sale.paidAt ? sale.paidAt.toISOString() : null,
  };
}

export function buyerView(buyer: BuyerRow, spentToday: bigint): BuyerView {
  return {
    id: buyer.id,
    name: buyer.name,
    walletAddress: buyer.walletAddress,
    assetCode: buyer.assetCode,
    assetScale: buyer.assetScale,
    perPaymentLimit: buyer.perPaymentLimit.toString(),
    dailyLimit: buyer.dailyLimit.toString(),
    spentToday: spentToday.toString(),
    remainingToday: remainingToday(buyer.dailyLimit, spentToday).toString(),
    hasGrant: buyer.grantAccessToken !== null,
  };
}

export function vendorView(vendor: VendorRow): VendorView {
  return {
    id: vendor.id,
    name: vendor.name,
    walletAddress: vendor.walletAddress,
    assetCode: vendor.assetCode,
    assetScale: vendor.assetScale,
  };
}
