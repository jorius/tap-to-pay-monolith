import 'dotenv/config';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { PrismaRepo } from '../src/db/repos.js';
import { createOpenPayments } from '../src/open-payments/client.js';
import { addWallet, findBuyer } from '../src/services/buyers.js';
import { addVendorWallet, findVendor } from '../src/services/vendors.js';

// Adds one more wallet to an EXISTING buyer (one more card in the app) or vendor (one more receiving wallet), through
// the logic of POST /buyers/:id/wallets and POST /vendors/:id/wallets.
// Usage: npm run add:wallet -- (--buyer <ref> | --vendor <ref>) --wallet <url> [--per-payment <digits>] [--daily <digits>]

const usage = [
  'Usage: npm run add:wallet -- (--buyer <ref> | --vendor <ref>) --wallet <url> [--per-payment <digits>] [--daily <digits>]',
  '  <ref> is an id, an exact name or one of its wallet addresses; --per-payment and --daily are buyer caps.',
].join('\n');
const { values } = parseArgs({
  options: {
    buyer: { type: 'string' },
    vendor: { type: 'string' },
    wallet: { type: 'string' },
    'per-payment': { type: 'string' },
    daily: { type: 'string' },
  },
});
const caps = values['per-payment'] !== undefined || values.daily !== undefined;
// Exactly one of --buyer and --vendor.
if (!values.wallet || !values.buyer === !values.vendor || (values.vendor && caps)) {
  console.error(usage);
  process.exit(1);
}

const cfg = loadConfig(process.env);
const prisma = createPrisma(cfg.DATABASE_URL);

try {
  const repo = new PrismaRepo(prisma);
  const op = await createOpenPayments({
    walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
    keyId: cfg.OP_KEY_ID,
    privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
  });
  if (values.vendor) {
    const vendor = findVendor(await repo.listVendors(), values.vendor);
    const view = await addVendorWallet({ repo, op }, vendor.id, values.wallet);
    const wallet = view.wallets.find((w) => w.walletAddress === values.wallet)!;
    const flag = wallet.isDefault ? '  (default)' : '';
    console.log(`vendor ${view.id}  ${view.name}  wallet ${wallet.id}  ${wallet.assetCode}/${wallet.assetScale}${flag}`);
  } else {
    const { buyer } = findBuyer(await repo.listBuyers(), values.buyer!);
    const view = await addWallet(
      {
        repo,
        op,
        now: () => new Date(),
        timeZone: cfg.DAILY_LIMIT_TZ,
        defaultLimits: { perPaymentLimit: BigInt(cfg.SEED_PER_PAYMENT_LIMIT), dailyLimit: BigInt(cfg.SEED_DAILY_LIMIT) },
      },
      buyer.id,
      { walletAddress: values.wallet, perPaymentLimit: values['per-payment'], dailyLimit: values.daily },
    );
    const wallet = view.wallets.find((w) => w.walletAddress === values.wallet)!;
    const flag = wallet.isDefault ? '  (default)' : '';
    console.log(`buyer ${view.id}  ${view.name}  wallet ${wallet.id}  ${wallet.assetCode}/${wallet.assetScale}${flag}`);
    console.log(`Next: npm run grant:buyer -- --buyer ${wallet.walletAddress}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
