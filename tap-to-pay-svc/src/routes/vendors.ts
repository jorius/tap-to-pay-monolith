import { Router } from 'express';
import type { Deps } from '../services/sales.js';
import { vendorView } from '../services/views.js';

export function vendorsRouter(deps: Deps): Router {
  const router = Router();
  router.get('/vendors', async (_req, res) => {
    const vendors = await deps.repo.listVendors();
    res.json({ data: vendors.map(vendorView), error: null });
  });
  return router;
}
