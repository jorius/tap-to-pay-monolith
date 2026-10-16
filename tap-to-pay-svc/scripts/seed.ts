import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { PrismaRepo } from '../src/db/repos.js';
import { createOpenPayments } from '../src/open-payments/client.js';

// Upserts the buyer and the vendor from SEED_*. Re-running updates name and asset only:
// limits and the buyer's grant survive.
const cfg = loadConfig(process.env);
const { SEED_BUYER_NAME, SEED_BUYER_WALLET, SEED_VENDOR_NAME, SEED_VENDOR_WALLET } = cfg;
if (!SEED_BUYER_NAME || !SEED_BUYER_WALLET || !SEED_VENDOR_NAME || !SEED_VENDOR_WALLET) {
  console.error('Set SEED_BUYER_NAME, SEED_BUYER_WALLET, SEED_VENDOR_NAME and SEED_VENDOR_WALLET in .env');
  process.exit(1);
}

const prisma = createPrisma(cfg.DATABASE_URL);
const repo = new PrismaRepo(prisma);
const op = await createOpenPayments({
  walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
  keyId: cfg.OP_KEY_ID,
  privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
});

try {
  const buyerWallet = await op.getWalletAddress(SEED_BUYER_WALLET);
  const vendorWallet = await op.getWalletAddress(SEED_VENDOR_WALLET);

  const buyer = await repo.upsertBuyer({
    name: SEED_BUYER_NAME,
    walletAddress: SEED_BUYER_WALLET,
    assetCode: buyerWallet.assetCode,
    assetScale: buyerWallet.assetScale,
    perPaymentLimit: BigInt(cfg.SEED_PER_PAYMENT_LIMIT),
    dailyLimit: BigInt(cfg.SEED_DAILY_LIMIT),
  });
  const vendor = await repo.upsertVendor({
    name: SEED_VENDOR_NAME,
    walletAddress: SEED_VENDOR_WALLET,
    assetCode: vendorWallet.assetCode,
    assetScale: vendorWallet.assetScale,
  });

  console.log(`buyer  ${buyer.id}  ${buyer.name}  ${buyer.assetCode}/${buyer.assetScale}`);
  console.log(`vendor ${vendor.id}  ${vendor.name}  ${vendor.assetCode}/${vendor.assetScale}`);
  if (buyer.assetCode !== vendor.assetCode) {
    console.warn('Warning: buyer and vendor assets differ; every charge will fail with ASSET_MISMATCH.');
  }
} finally {
  await prisma.$disconnect();
}
