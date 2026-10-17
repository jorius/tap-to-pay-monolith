import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { HttpErrorCode } from './contracts.js';
import { buyersRouter } from './routes/buyers.js';
import { debugRouter } from './routes/debug.js';
import { healthRouter } from './routes/health.js';
import { payRouter } from './routes/pay.js';
import { salesRouter } from './routes/sales.js';
import { vendorsRouter } from './routes/vendors.js';
import { HttpError } from './services/errors.js';
import type { Deps } from './services/sales.js';

// publicUrl: where buyers reach the payment page (PUBLIC_URL); unset, it is derived from each request.
export type AppMeta = { clientWalletAddress: string; publicUrl?: string };

// shortcut: no authentication; anyone on the network can read buyers, change limits and create sales.
export function createApp(deps: Deps, meta: AppMeta) {
  const app = express();
  app.use(express.json());

  app.use(healthRouter(meta));
  app.use(vendorsRouter(deps));
  app.use(buyersRouter(deps));
  app.use(salesRouter(deps));
  app.use(payRouter(deps, meta.publicUrl));
  app.use(debugRouter(deps, meta));

  app.use((req, res) => {
    res.status(404).json(failure('NOT_FOUND', `No route for ${req.method} ${req.path}`));
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json(failure(err.code, err.message));
    } else if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json(failure('VALIDATION', message));
    } else if (err?.type === 'entity.parse.failed') {
      res.status(400).json(failure('VALIDATION', 'Invalid JSON body'));
    } else {
      console.error('Unexpected error', err);
      res.status(500).json(failure('INTERNAL', 'Unexpected error'));
    }
  };
  app.use(onError);

  return app;
}

const failure = (code: HttpErrorCode, message: string) => ({ data: null, error: { code, message } });
