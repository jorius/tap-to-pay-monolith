-- Each wallet's publicName from its wallet address document. Generated with `prisma migrate diff`; existing rows
-- start null and the service fills them at start-up.
-- AlterTable
ALTER TABLE "BuyerWallet" ADD COLUMN     "publicName" TEXT;

-- AlterTable
ALTER TABLE "VendorWallet" ADD COLUMN     "publicName" TEXT;
