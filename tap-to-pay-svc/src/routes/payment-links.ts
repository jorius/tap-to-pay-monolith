import { Router } from 'express';
import { z } from 'zod';
import {
  chargePaymentLink,
  createPaymentLink,
  getPaymentRequest,
  paymentLinkPage,
  paymentLinkQrSvg,
  requestBaseUrl,
} from '../services/payment-links.js';
import type { Deps } from '../services/sales.js';

const lang = z.enum(['es', 'en']).default('es');
const linkBody = z.object({ phone: z.string().optional(), lang });
const chargeBody = z.object({ walletAddress: z.string().url() });
const pageQuery = z.object({ lang });

export function paymentLinksRouter(deps: Deps): Router {
  const router = Router();
  const baseUrl = (req: Parameters<typeof requestBaseUrl>[0]) => requestBaseUrl(req, deps.links.publicUrl);

  router.post('/sales/:id/payment-link', async (req, res) => {
    const body = linkBody.parse(req.body ?? {});
    res.json({ data: await createPaymentLink(deps, req.params.id, baseUrl(req), body), error: null });
  });

  router.get('/pay/:code', async (req, res) => {
    res.json({ data: await getPaymentRequest(deps, req.params.code), error: null });
  });

  // As POST /sales/:id/charge: a refused charge answers 200 with the sale FAILED.
  router.post('/pay/:code/charge', async (req, res) => {
    const { walletAddress } = chargeBody.parse(req.body);
    res.json({ data: await chargePaymentLink(deps, req.params.code, walletAddress), error: null });
  });

  router.get('/pay/:code/qr.svg', async (req, res) => {
    res.set('cache-control', 'no-store').type('image/svg+xml').send(await paymentLinkQrSvg(deps, req.params.code, baseUrl(req)));
  });

  router.get('/p/:code', async (req, res) => {
    const page = await paymentLinkPage(deps, req.params.code, pageQuery.parse(req.query).lang);
    // The page shows the sale's live state, so never from a cache.
    res.status(page.status).set('cache-control', 'no-store').type('html').send(page.html);
  });

  return router;
}
