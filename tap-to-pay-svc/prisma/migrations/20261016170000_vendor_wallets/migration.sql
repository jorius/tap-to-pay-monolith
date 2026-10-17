-- One vendor receives into N wallets. Generated with `prisma migrate diff`, then reordered by hand so every existing
-- vendor's wallet address and asset move into VendorWallet before the old columns are dropped.

-- CreateTable
CREATE TABLE "VendorWallet" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetScale" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorWallet_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "defaultWalletId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "vendorWalletId" TEXT;

-- Move the data: each existing vendor becomes the owner of one wallet with the same address and asset, with a
-- deterministic id; that wallet is its default, and every one of its sales received into it.
INSERT INTO "VendorWallet" ("id", "vendorId", "walletAddress", "assetCode", "assetScale", "createdAt")
SELECT 'vw_' || "id", "id", "walletAddress", "assetCode", "assetScale", "createdAt"
FROM "Vendor";

UPDATE "Vendor" SET "defaultWalletId" = 'vw_' || "id";

UPDATE "Sale" SET "vendorWalletId" = 'vw_' || "vendorId";

-- DropIndex
DROP INDEX "Vendor_walletAddress_key";

-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "assetCode",
DROP COLUMN "assetScale",
DROP COLUMN "walletAddress";

-- CreateIndex
CREATE UNIQUE INDEX "VendorWallet_walletAddress_key" ON "VendorWallet"("walletAddress");

-- AddForeignKey
ALTER TABLE "VendorWallet" ADD CONSTRAINT "VendorWallet_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_vendorWalletId_fkey" FOREIGN KEY ("vendorWalletId") REFERENCES "VendorWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
