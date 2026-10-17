import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db/prisma.js';
import { PrismaRepo } from './db/repos.js';
import { createOpenPayments } from './open-payments/client.js';
import { refreshPublicNames } from './services/public-names.js';
import type { Deps } from './services/sales.js';

const cfg = loadConfig(process.env);

if (!existsSync(cfg.OP_PRIVATE_KEY_PATH)) {
  console.error(`Could not load private key at ${cfg.OP_PRIVATE_KEY_PATH}`);
  process.exit(1);
}

const op = await createOpenPayments({
  walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
  keyId: cfg.OP_KEY_ID,
  privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
});

const deps: Deps = {
  repo: new PrismaRepo(createPrisma(cfg.DATABASE_URL)),
  op,
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeZone: cfg.DAILY_LIMIT_TZ,
  pollSeconds: cfg.CHARGE_POLL_SECONDS,
  defaultLimits: { perPaymentLimit: BigInt(cfg.SEED_PER_PAYMENT_LIMIT), dailyLimit: BigInt(cfg.SEED_DAILY_LIMIT) },
  links: {
    ttlMinutes: cfg.PAYMENT_LINK_TTL_MINUTES,
    publicBaseUrl: cfg.PUBLIC_BASE_URL,
    appLinkBase: cfg.APP_LINK_BASE,
  },
};
const app = createApp(deps, { clientWalletAddress: cfg.OP_CLIENT_WALLET_ADDRESS });

// Express 5 hands listen errors (EADDRINUSE) to this callback instead of throwing.
// shortcut: plain HTTP on the LAN; deploy behind HTTPS for anything beyond the demo Wi-Fi.
app.listen(cfg.PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Could not listen on port ${cfg.PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`tap-to-pay-svc listening on http://0.0.0.0:${cfg.PORT}`);
  // In the background: requests are served meanwhile, with the names stored so far.
  refreshPublicNames(deps).catch((e) => console.warn(`Could not refresh wallet public names: ${e instanceof Error ? e.message : e}`));
});
