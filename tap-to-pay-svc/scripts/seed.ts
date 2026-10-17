import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { PrismaRepo } from '../src/db/repos.js';
import { createOpenPayments } from '../src/open-payments/client.js';
import { addBuyer } from '../src/services/buyers.js';

// Upserts the buyer and the vendor from SEED_*, with SEED_BUYER_WALLET and SEED_VENDOR_WALLET as their first and
// default wallets. Re-running updates names and assets only: caps and the wallet's grant survive.
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
  const vendorWallet = await op.getWalletAddress(SEED_VENDOR_WALLET);

  const buyer = await addBuyer(
    { repo, op },
    {
      name: SEED_BUYER_NAME,
      walletAddress: SEED_BUYER_WALLET,
      perPaymentLimit: cfg.SEED_PER_PAYMENT_LIMIT,
      dailyLimit: cfg.SEED_DAILY_LIMIT,
    },
  );
  const vendor = await repo.upsertVendorWithWallet(SEED_VENDOR_NAME, {
    walletAddress: SEED_VENDOR_WALLET,
    publicName: vendorWallet.publicName,
    assetCode: vendorWallet.assetCode,
    assetScale: vendorWallet.assetScale,
  });

  const wallet = buyer.wallets.find((w) => w.walletAddress === SEED_BUYER_WALLET)!;
  console.log(`buyer  ${buyer.id}  ${buyer.name}  wallet ${wallet.id}  ${wallet.assetCode}/${wallet.assetScale}`);
  const receiving = vendor.wallets.find((w) => w.walletAddress === SEED_VENDOR_WALLET)!;
  console.log(`vendor ${vendor.id}  ${vendor.name}  wallet ${receiving.id}  ${receiving.assetCode}/${receiving.assetScale}`);
} finally {
  await prisma.$disconnect();
}
