import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db/prisma.js';
import { PrismaRepo } from './db/repos.js';
import { createOpenPayments } from './open-payments/client.js';

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

const app = createApp(
  {
    repo: new PrismaRepo(createPrisma(cfg.DATABASE_URL)),
    op,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeZone: cfg.DAILY_LIMIT_TZ,
    pollSeconds: cfg.CHARGE_POLL_SECONDS,
  },
  { clientWalletAddress: cfg.OP_CLIENT_WALLET_ADDRESS },
);

// Express 5 hands listen errors (EADDRINUSE) to this callback instead of throwing.
// shortcut: plain HTTP on the LAN; deploy behind HTTPS for anything beyond the demo Wi-Fi.
app.listen(cfg.PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Could not listen on port ${cfg.PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`tap-to-pay-svc listening on http://0.0.0.0:${cfg.PORT}`);
});
