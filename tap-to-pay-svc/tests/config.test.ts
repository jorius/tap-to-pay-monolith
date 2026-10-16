import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const required = {
  DATABASE_URL: 'postgresql://postgres:x@localhost:55000/tap_to_pay',
  OP_CLIENT_WALLET_ADDRESS: 'https://ilp.test/service',
  OP_KEY_ID: 'key-1',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(required)).toMatchObject({
      PORT: 4000,
      OP_PRIVATE_KEY_PATH: './private.key',
      SEED_PER_PAYMENT_LIMIT: '2000',
      SEED_DAILY_LIMIT: '5000',
      DAILY_LIMIT_TZ: 'America/Bogota',
      CHARGE_POLL_SECONDS: 8,
    });
  });

  it('names the missing variable', () => {
    const { OP_KEY_ID: _, ...rest } = required;
    expect(() => loadConfig(rest)).toThrow(/Invalid environment: OP_KEY_ID/);
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ ...required, PORT: '' }).PORT).toBe(4000);
  });
});
