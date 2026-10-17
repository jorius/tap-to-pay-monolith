-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MERCHANT';
-- CreateTable
CREATE TABLE "RecurringPayment" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "walletId" TEXT,
    "billerId" TEXT,
    "payeeName" TEXT NOT NULL,
    "payeeWalletAddress" TEXT NOT NULL,
    "payeeAssetCode" TEXT NOT NULL,
    "payeeAssetScale" INTEGER NOT NULL,
    "reference" TEXT,
    "amount" BIGINT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSaleId" TEXT,
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RecurringPayment_active_nextRunAt_idx" ON "RecurringPayment"("active", "nextRunAt");
-- CreateIndex
CREATE INDEX "RecurringPayment_buyerId_idx" ON "RecurringPayment"("buyerId");
-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "BuyerWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
