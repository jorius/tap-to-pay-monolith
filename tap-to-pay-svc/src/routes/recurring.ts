import { Router } from 'express';
import { z } from 'zod';
import { listBillers } from '../services/billers.js';
import {
  addRecurring,
  getVendorPayer,
  listRecurring,
  payRecurringNow,
  removeRecurring,
  setRecurringActive,
} from '../services/recurring.js';
import type { Deps } from '../services/sales.js';

const addBody = z.object({
  billerId: z.string().min(1).optional(),
  payeeName: z.string().optional(),
  payeeWalletAddress: z.string().url().optional(),
  reference: z.string().optional(),
  amount: z.string(),
  dayOfMonth: z.number().int(),
  walletId: z.string().min(1).optional(),
});
const patchBody = z.object({ active: z.boolean() });

// The catalog of services and a vendor's monthly payments to them (SDD §10, "Recurring payments").
export function recurringRouter(deps: Deps): Router {
  const router = Router();

  router.get('/billers', (_req, res) => {
    res.json({ data: listBillers(deps), error: null });
  });

  router.get('/vendors/:id/payer', async (req, res) => {
    res.json({ data: await getVendorPayer(deps, req.params.id), error: null });
  });

  router.get('/vendors/:id/recurring', async (req, res) => {
    res.json({ data: await listRecurring(deps, req.params.id), error: null });
  });

  router.post('/vendors/:id/recurring', async (req, res) => {
    res.status(201).json({ data: await addRecurring(deps, req.params.id, addBody.parse(req.body)), error: null });
  });

  router.patch('/vendors/:id/recurring/:rid', async (req, res) => {
    const { active } = patchBody.parse(req.body);
    res.json({ data: await setRecurringActive(deps, req.params.id, req.params.rid, active), error: null });
  });

  router.delete('/vendors/:id/recurring/:rid', async (req, res) => {
    await removeRecurring(deps, req.params.id, req.params.rid);
    res.json({ data: { removed: true }, error: null });
  });

  // As a tap: a refused charge answers 200 with the sale FAILED.
  router.post('/vendors/:id/recurring/:rid/pay', async (req, res) => {
    res.json({ data: await payRecurringNow(deps, req.params.id, req.params.rid), error: null });
  });

  return router;
}
