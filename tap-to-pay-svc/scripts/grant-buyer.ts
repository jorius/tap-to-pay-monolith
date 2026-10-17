import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { isFinalizedGrantWithAccessToken, isPendingGrant } from '@interledger/open-payments';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { PrismaRepo } from '../src/db/repos.js';
import { createSdkClient } from '../src/open-payments/client.js';
import { expectedInteractionHashes, verifyInteractionHash } from '../src/open-payments/hash.js';
import { grantTarget } from '../src/services/buyers.js';
import { dayRange } from '../src/services/limits.js';
import { formatAmount, parseAmount } from '../src/services/money.js';

// The one-time interactive outgoing-payment grant for ONE wallet (SDD section 10, step 3), capped per day by the
// wallet itself: --wallet, else the wallet --buyer names, else the buyer's default wallet.
// Usage: npm run grant:buyer -- --buyer <id|name|walletAddress> [--wallet <url>] [--amount <digits per day>]

const FINISH_PORT = 4100;
const FINISH_URI = `http://localhost:${FINISH_PORT}/finish`;
const usage =
  'Usage: npm run grant:buyer -- --buyer <id|name|walletAddress> [--wallet <url>] [--amount <digits per day>]';

const { values } = parseArgs({
  options: { buyer: { type: 'string' }, wallet: { type: 'string' }, amount: { type: 'string' } },
});
if (!values.buyer) {
  console.error(usage);
  process.exit(1);
}

const cfg = loadConfig(process.env);
const prisma = createPrisma(cfg.DATABASE_URL);
const repo = new PrismaRepo(prisma);

try {
  const { buyer, wallet: buyerWallet } = grantTarget(await repo.listBuyers(), {
    buyer: values.buyer,
    wallet: values.wallet,
  });

  const client = await createSdkClient({
    walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
    keyId: cfg.OP_KEY_ID,
    privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
  });
  const wallet = await client.walletAddress.get({ url: buyerWallet.walletAddress });
  const clientNonce = randomBytes(16).toString('hex');

  // The wallet enforces this per local day, starting at today's local midnight like the service's daily cap.
  const dailyDebit = values.amount ? parseAmount(values.amount) : buyerWallet.dailyLimit;
  const authorized = `${formatAmount(dailyDebit, wallet.assetScale)} ${wallet.assetCode}`;
  const intervalStart = dayRange(new Date(), cfg.DAILY_LIMIT_TZ).start.toISOString();
  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [
          {
            type: 'outgoing-payment',
            actions: ['create', 'read'],
            identifier: wallet.id,
            limits: {
              debitAmount: { value: dailyDebit.toString(), assetCode: wallet.assetCode, assetScale: wallet.assetScale },
              interval: `R/${intervalStart}/P1D`,
            },
          },
        ],
      },
      interact: {
        start: ['redirect'],
        finish: { method: 'redirect', uri: FINISH_URI, nonce: clientNonce },
      },
    },
  );
  if (!isPendingGrant(grant)) throw new Error('Expected an interactive grant, got a finalized one');

  const finished = waitForFinish();
  console.log(
    `\nOpen this URL, log in as ${buyer.name} (${buyerWallet.walletAddress}) and click Accept (up to ${authorized} per day):\n\n  ${grant.interact.redirect}\n`,
  );
  const params = await finished;

  if (params.get('result') === 'grant_rejected') throw new Error('The buyer rejected the grant');
  const interactRef = params.get('interact_ref');
  const hash = params.get('hash');
  if (!interactRef || !hash) throw new Error('The finish redirect carried no interact_ref or hash');

  const hashInput = {
    clientNonce,
    interactNonce: grant.interact.finish,
    interactRef,
    authServer: wallet.authServer,
  };
  if (!verifyInteractionHash({ ...hashInput, hash })) {
    console.error(`Interaction hash did not verify.\n  received: ${hash}`);
    for (const digest of expectedInteractionHashes(hashInput)) console.error(`  expected: ${digest}`);
    process.exitCode = 1;
  } else {
    const continued = await client.grant.continue(
      { url: grant.continue.uri, accessToken: grant.continue.access_token.value },
      { interact_ref: interactRef },
    );
    if (!isFinalizedGrantWithAccessToken(continued)) throw new Error('The grant did not finalize with a token');
    await repo.updateWalletGrant(buyerWallet.id, {
      grantAccessToken: continued.access_token.value,
      grantManageUrl: continued.access_token.manage,
      grantDailyLimit: dailyDebit,
    });
    console.log(
      `Grant stored for ${buyer.name}'s ${buyerWallet.walletAddress}: up to ${authorized} per day. Every tap from it is now silent.`,
    );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

/** A one-shot listener for the wallet's finish redirect. */
function waitForFinish(): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', FINISH_URI);
      if (url.pathname !== '/finish') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Done. You can close this tab.');
      server.close();
      resolve(url.searchParams);
    });
    server.on('error', reject);
    server.listen(FINISH_PORT, 'localhost');
  });
}
