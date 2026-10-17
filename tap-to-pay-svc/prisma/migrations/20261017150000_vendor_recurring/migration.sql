-- Recurring payments belong to a vendor, paid from its payer identity. Rows enrolled by buyers before this change (unreleased) are dropped.
DELETE FROM "RecurringPayment";

-- DropIndex
DROP INDEX "RecurringPayment_buyerId_idx";
-- AlterTable
ALTER TABLE "RecurringPayment" ADD COLUMN     "vendorId" TEXT NOT NULL;
-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "payerBuyerId" TEXT;
-- CreateIndex
CREATE INDEX "RecurringPayment_vendorId_idx" ON "RecurringPayment"("vendorId");
-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
