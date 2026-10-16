import { Router } from 'express';
import { z } from 'zod';
import { chargeSale, createSale, refreshSale, type Deps } from '../services/sales.js';

const createBody = z.object({ vendorId: z.string().min(1), amount: z.string() });
const chargeBody = z.object({ walletAddress: z.string().url() });

export function salesRouter(deps: Deps): Router {
  const router = Router();

  router.post('/sales', async (req, res) => {
    const { vendorId, amount } = createBody.parse(req.body);
    res.status(201).json({ data: await createSale(deps, vendorId, amount), error: null });
  });

  // A refused charge is not an HTTP error: it answers 200 with the sale FAILED.
  router.post('/sales/:id/charge', async (req, res) => {
    const { walletAddress } = chargeBody.parse(req.body);
    res.json({ data: await chargeSale(deps, req.params.id, walletAddress), error: null });
  });

  router.get('/sales/:id', async (req, res) => {
    res.json({ data: await refreshSale(deps, req.params.id), error: null });
  });

  return router;
}
