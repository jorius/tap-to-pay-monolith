import 'dotenv/config';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { PrismaRepo } from '../src/db/repos.js';
import { createOpenPayments } from '../src/open-payments/client.js';
import { addBuyer } from '../src/services/buyers.js';

// Registers a NEW buyer (a person) with a first, default wallet; add:wallet adds more wallets to an existing one.
// Usage: npm run add:buyer -- --name <name> --wallet <url> [--per-payment <digits>] [--daily <digits>]

const usage = 'Usage: npm run add:buyer -- --name <name> --wallet <url> [--per-payment <digits>] [--daily <digits>]';
const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    wallet: { type: 'string' },
    'per-payment': { type: 'string' },
    daily: { type: 'string' },
  },
});
if (!values.name || !values.wallet) {
  console.error(usage);
  process.exit(1);
}

const cfg = loadConfig(process.env);
const prisma = createPrisma(cfg.DATABASE_URL);

try {
  const op = await createOpenPayments({
    walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
    keyId: cfg.OP_KEY_ID,
    privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
  });
  const buyer = await addBuyer(
    { repo: new PrismaRepo(prisma), op },
    {
      name: values.name,
      walletAddress: values.wallet,
      perPaymentLimit: values['per-payment'] ?? cfg.SEED_PER_PAYMENT_LIMIT,
      dailyLimit: values.daily ?? cfg.SEED_DAILY_LIMIT,
    },
  );
  const wallet = buyer.wallets.find((w) => w.walletAddress === values.wallet)!;
  console.log(`buyer ${buyer.id}  ${buyer.name}  wallet ${wallet.id}  ${wallet.assetCode}/${wallet.assetScale}  ${wallet.walletAddress}`);
  console.log(`Next: npm run grant:buyer -- --buyer ${wallet.walletAddress}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
