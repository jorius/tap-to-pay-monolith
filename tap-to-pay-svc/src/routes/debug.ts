import { Router } from 'express';
import type { AppMeta } from '../app.js';
import { debugWallets } from '../services/debug.js';
import type { Deps } from '../services/sales.js';

export function debugRouter(deps: Deps, meta: AppMeta): Router {
  const router = Router();
  router.get('/debug/wallets', async (_req, res) => {
    res.json({ data: await debugWallets(deps, meta.clientWalletAddress), error: null });
  });
  return router;
}
