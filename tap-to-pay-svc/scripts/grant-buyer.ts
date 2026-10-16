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

// The one-time interactive outgoing-payment grant (SDD section 10, step 3).
// Usage: npm run grant:buyer -- --buyer <id|name|walletAddress>

const FINISH_PORT = 4100;
const FINISH_URI = `http://localhost:${FINISH_PORT}/finish`;

const { values } = parseArgs({ options: { buyer: { type: 'string' } } });
if (!values.buyer) {
  console.error('Usage: npm run grant:buyer -- --buyer <id|name|walletAddress>');
  process.exit(1);
}

const cfg = loadConfig(process.env);
const prisma = createPrisma(cfg.DATABASE_URL);
const repo = new PrismaRepo(prisma);

try {
  const buyers = await repo.listBuyers();
  const key = values.buyer;
  const buyer =
    buyers.find((b) => b.id === key) ??
    buyers.find((b) => b.name === key) ??
    buyers.find((b) => b.walletAddress === key);
  if (!buyer) throw new Error(`Buyer "${key}" not found (match is exact: id, name or wallet address)`);

  const client = await createSdkClient({
    walletAddressUrl: cfg.OP_CLIENT_WALLET_ADDRESS,
    keyId: cfg.OP_KEY_ID,
    privateKeyPath: cfg.OP_PRIVATE_KEY_PATH,
  });
  const wallet = await client.walletAddress.get({ url: buyer.walletAddress });
  const clientNonce = randomBytes(16).toString('hex');

  // shortcut: no `limits` in the grant, so the token can spend any amount; the service is the only enforcer.
  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{ type: 'outgoing-payment', actions: ['create', 'read'], identifier: wallet.id }],
      },
      interact: {
        start: ['redirect'],
        finish: { method: 'redirect', uri: FINISH_URI, nonce: clientNonce },
      },
    },
  );
  if (!isPendingGrant(grant)) throw new Error('Expected an interactive grant, got a finalized one');

  const finished = waitForFinish();
  console.log(`\nOpen this URL, log in as ${buyer.name} and click Accept:\n\n  ${grant.interact.redirect}\n`);
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
    await repo.updateBuyerGrant(buyer.id, {
      grantAccessToken: continued.access_token.value,
      grantManageUrl: continued.access_token.manage,
    });
    console.log(`Grant stored for ${buyer.name}. Every tap is now silent.`);
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
