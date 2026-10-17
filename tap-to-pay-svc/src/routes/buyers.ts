import { Router } from 'express';
import { z } from 'zod';
import {
  addWallet,
  getBuyer,
  listBuyerSales,
  listBuyerViews,
  removeWallet,
  setDefaultWallet,
  updateLimits,
  updateWalletLimits,
} from '../services/buyers.js';
import type { Deps } from '../services/sales.js';

const limitsBody = z.object({ perPaymentLimit: z.string(), dailyLimit: z.string() });
const walletBody = z.object({ walletAddress: z.string().url() });
const defaultWalletBody = z.object({ walletId: z.string().min(1) });
const salesQuery = z.object({
  walletId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function buyersRouter(deps: Deps): Router {
  const router = Router();

  router.get('/buyers', async (_req, res) => {
    res.json({ data: await listBuyerViews(deps), error: null });
  });

  router.get('/buyers/:id', async (req, res) => {
    res.json({ data: await getBuyer(deps, req.params.id), error: null });
  });

  // The default wallet's caps, as in the one-wallet contract.
  router.patch('/buyers/:id/limits', async (req, res) => {
    const body = limitsBody.parse(req.body);
    res.json({ data: await updateLimits(deps, req.params.id, body), error: null });
  });

  router.post('/buyers/:id/wallets', async (req, res) => {
    const { walletAddress } = walletBody.parse(req.body);
    res.status(201).json({ data: await addWallet(deps, req.params.id, { walletAddress }), error: null });
  });

  router.put('/buyers/:id/default-wallet', async (req, res) => {
    const { walletId } = defaultWalletBody.parse(req.body);
    res.json({ data: await setDefaultWallet(deps, req.params.id, walletId), error: null });
  });

  router.patch('/buyers/:id/wallets/:walletId/limits', async (req, res) => {
    const body = limitsBody.parse(req.body);
    res.json({ data: await updateWalletLimits(deps, req.params.id, req.params.walletId, body), error: null });
  });

  router.delete('/buyers/:id/wallets/:walletId', async (req, res) => {
    res.json({ data: await removeWallet(deps, req.params.id, req.params.walletId), error: null });
  });

  router.get('/buyers/:id/sales', async (req, res) => {
    const { walletId, limit } = salesQuery.parse(req.query);
    res.json({ data: await listBuyerSales(deps, req.params.id, walletId, limit), error: null });
  });

  return router;
}
