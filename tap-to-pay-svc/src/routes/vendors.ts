import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../services/sales.js';
import { renderStatementPdf } from '../services/statement-pdf.js';
import { buildStatement, parseMonth } from '../services/statement.js';
import {
  addVendorWallet,
  listVendorSales,
  listVendorViews,
  removeVendorWallet,
  setDefaultVendorWallet,
  vendorSummary,
} from '../services/vendors.js';

const walletId = z.string().min(1);
const walletBody = z.object({ walletAddress: z.string().url() });
const defaultWalletBody = z.object({ walletId });
const statementQuery = z.object({ month: z.string().optional(), lang: z.enum(['es', 'en']).default('es') });
const summaryQuery = z.object({ range: z.enum(['today', 'week', 'month']).default('today'), walletId: walletId.optional() });

const salesQuery = z.object({
  status: z.enum(['AWAITING_TAP', 'CHARGING', 'PAID', 'FAILED']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine(isCalendarDay, 'must be a calendar day')
    .optional(),
  // Over 200 is capped rather than refused, so a client asking for "everything" still gets an answer.
  limit: z.coerce.number().int().positive().default(50).transform((n) => Math.min(n, 200)),
  walletId: walletId.optional(),
  // in: sales received; out: recurring payments made; all (default): both, as Movimientos shows them.
  direction: z.enum(['in', 'out', 'all']).default('all'),
});

export function vendorsRouter(deps: Deps): Router {
  const router = Router();

  router.get('/vendors', async (_req, res) => {
    res.json({ data: await listVendorViews(deps), error: null });
  });

  router.post('/vendors/:id/wallets', async (req, res) => {
    const { walletAddress } = walletBody.parse(req.body);
    res.status(201).json({ data: await addVendorWallet(deps, req.params.id, walletAddress), error: null });
  });

  router.put('/vendors/:id/default-wallet', async (req, res) => {
    const body = defaultWalletBody.parse(req.body);
    res.json({ data: await setDefaultVendorWallet(deps, req.params.id, body.walletId), error: null });
  });

  router.delete('/vendors/:id/wallets/:walletId', async (req, res) => {
    res.json({ data: await removeVendorWallet(deps, req.params.id, req.params.walletId), error: null });
  });

  router.get('/vendors/:id/summary', async (req, res) => {
    const query = summaryQuery.parse(req.query);
    res.json({ data: await vendorSummary(deps, req.params.id, query.range, query.walletId), error: null });
  });

  // The monthly statement as a PDF, for a lender: every receiving wallet with activity, one section each.
  router.get('/vendors/:id/statement.pdf', async (req, res) => {
    const query = statementQuery.parse(req.query);
    const statement = await buildStatement(deps, req.params.id, parseMonth(deps, query.month));
    const pdf = await renderStatementPdf(statement, query.lang);
    const name = `${query.lang === 'es' ? 'resumen' : 'statement'}-${statement.month}.pdf`;
    res
      .set('cache-control', 'no-store')
      .set('content-disposition', `inline; filename="${name}"`)
      .type('application/pdf')
      .send(pdf);
  });

  router.get('/vendors/:id/sales', async (req, res) => {
    const query = salesQuery.parse(req.query);
    res.json({ data: await listVendorSales(deps, req.params.id, query), error: null });
  });

  return router;
}

function isCalendarDay(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
