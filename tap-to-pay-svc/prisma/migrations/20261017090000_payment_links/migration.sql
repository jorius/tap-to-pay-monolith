-- Payment links and QR: a sale can also be charged through a public code, sent by WhatsApp or shown as a QR.
ALTER TABLE "Sale" ADD COLUMN "description" TEXT,
ADD COLUMN "payCode" TEXT,
ADD COLUMN "payCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "chargedVia" TEXT;

CREATE UNIQUE INDEX "Sale_payCode_key" ON "Sale"("payCode");
