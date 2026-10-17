import { z } from 'zod';

const digits = z.string().regex(/^\d+$/, 'must be digits in the smallest unit');

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  OP_CLIENT_WALLET_ADDRESS: z.string().url(),
  OP_KEY_ID: z.string().min(1),
  OP_PRIVATE_KEY_PATH: z.string().min(1).default('./private.key'),
  // Only the seed script needs these.
  SEED_BUYER_NAME: z.string().optional(),
  SEED_BUYER_WALLET: z.string().url().optional(),
  SEED_VENDOR_NAME: z.string().optional(),
  SEED_VENDOR_WALLET: z.string().url().optional(),
  SEED_PER_PAYMENT_LIMIT: digits.default('2000'),
  SEED_DAILY_LIMIT: digits.default('5000'),
  // Not validated at startup: an unknown zone fails on the first daily-cap check.
  DAILY_LIMIT_TZ: z.string().min(1).default('America/Bogota'),
  CHARGE_POLL_SECONDS: z.coerce.number().int().positive().default(8),
  // The public base URL of the payment page that the QR and the WhatsApp link open; unset, taken from each request.
  PUBLIC_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  // Treat empty strings as unset, so `FOO=` in .env falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
