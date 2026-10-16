import { Router } from 'express';
import { z } from 'zod';
import { getBuyer, listBuyerSales, listBuyerViews, updateLimits } from '../services/buyers.js';
import type { Deps } from '../services/sales.js';

const limitsBody = z.object({ perPaymentLimit: z.string(), dailyLimit: z.string() });

export function buyersRouter(deps: Deps): Router {
  const router = Router();

  router.get('/buyers', async (_req, res) => {
    res.json({ data: await listBuyerViews(deps), error: null });
  });

  router.get('/buyers/:id', async (req, res) => {
    res.json({ data: await getBuyer(deps, req.params.id), error: null });
  });

  router.patch('/buyers/:id/limits', async (req, res) => {
    const body = limitsBody.parse(req.body);
    res.json({ data: await updateLimits(deps, req.params.id, body), error: null });
  });

  router.get('/buyers/:id/sales', async (req, res) => {
    res.json({ data: await listBuyerSales(deps, req.params.id), error: null });
  });

  return router;
}
