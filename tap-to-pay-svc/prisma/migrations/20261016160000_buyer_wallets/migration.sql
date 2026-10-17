-- One buyer owns N wallets. Generated with `prisma migrate diff`, then reordered by hand so every existing
-- buyer's wallet, caps and grant move into BuyerWallet before the old columns are dropped.

-- CreateTable
CREATE TABLE "BuyerWallet" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetScale" INTEGER NOT NULL,
    "perPaymentLimit" BIGINT NOT NULL,
    "dailyLimit" BIGINT NOT NULL,
    "grantAccessToken" TEXT,
    "grantManageUrl" TEXT,
    "grantDailyLimit" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerWallet_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Buyer" ADD COLUMN     "defaultWalletId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "buyerWalletId" TEXT;

-- Move the data: each existing buyer becomes the owner of one wallet with the same address, asset, caps and grant
-- (tokens preserved), with a deterministic id; that wallet is its default, and its claimed sales point at it.
INSERT INTO "BuyerWallet" ("id", "buyerId", "walletAddress", "assetCode", "assetScale", "perPaymentLimit", "dailyLimit", "grantAccessToken", "grantManageUrl", "grantDailyLimit", "createdAt")
SELECT 'w_' || "id", "id", "walletAddress", "assetCode", "assetScale", "perPaymentLimit", "dailyLimit", "grantAccessToken", "grantManageUrl", "grantDailyLimit", "createdAt"
FROM "Buyer";

UPDATE "Buyer" SET "defaultWalletId" = 'w_' || "id";

UPDATE "Sale" SET "buyerWalletId" = 'w_' || "buyerId" WHERE "buyerId" IS NOT NULL;

-- DropIndex
DROP INDEX "Buyer_walletAddress_key";

-- AlterTable
ALTER TABLE "Buyer" DROP COLUMN "assetCode",
DROP COLUMN "assetScale",
DROP COLUMN "dailyLimit",
DROP COLUMN "grantAccessToken",
DROP COLUMN "grantDailyLimit",
DROP COLUMN "grantManageUrl",
DROP COLUMN "perPaymentLimit",
DROP COLUMN "walletAddress";

-- CreateIndex
CREATE UNIQUE INDEX "BuyerWallet_walletAddress_key" ON "BuyerWallet"("walletAddress");

-- CreateIndex
CREATE INDEX "Sale_buyerWalletId_status_createdAt_idx" ON "Sale"("buyerWalletId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "BuyerWallet" ADD CONSTRAINT "BuyerWallet_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_buyerWalletId_fkey" FOREIGN KEY ("buyerWalletId") REFERENCES "BuyerWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
