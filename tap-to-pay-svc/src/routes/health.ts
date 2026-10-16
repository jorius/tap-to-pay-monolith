import { Router } from 'express';
import type { Health } from '../contracts.js';

/** Touches neither the database nor the wallets. */
export function healthRouter(meta: { clientWalletAddress: string }): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    const data: Health = { ok: true, clientWalletAddress: meta.clientWalletAddress };
    res.json({ data, error: null });
  });
  return router;
}
