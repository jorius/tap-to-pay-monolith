-- The daily cap now sums what the buyer pays in the buyer's asset, so sales in another asset can count.
ALTER TABLE "Sale" ADD COLUMN "debitAmount" BIGINT,
ADD COLUMN "debitAssetCode" TEXT,
ADD COLUMN "debitAssetScale" INTEGER;

-- Existing claimed sales were same-asset by rule, so their debit is the sale amount.
UPDATE "Sale" SET "debitAmount" = "amount", "debitAssetCode" = "assetCode", "debitAssetScale" = "assetScale"
WHERE "buyerId" IS NOT NULL;
