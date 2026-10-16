import { describe, expect, it } from 'vitest';
import { isClientError, isUnauthorized, toWalletError, WalletError } from '../src/open-payments/types.js';

describe('isUnauthorized', () => {
  it('is true for 401 and 403, not 400', () => {
    expect(isUnauthorized(new WalletError('x', 401))).toBe(true);
    expect(isUnauthorized(new WalletError('x', 403))).toBe(true);
    expect(isUnauthorized(new WalletError('x', 400))).toBe(false);
    expect(isUnauthorized(new Error('x'))).toBe(false);
  });
});

describe('isClientError', () => {
  it('is true only for 4xx wallet errors', () => {
    expect(isClientError(new WalletError('x', 404))).toBe(true);
    expect(isClientError(new WalletError('x', 503))).toBe(false);
    expect(isClientError(new WalletError('x'))).toBe(false);
  });
});

describe('toWalletError', () => {
  it("prefers the wallet's description", () => {
    const sdkError = Object.assign(new Error('Error making Open Payments POST request'), {
      description: 'Inactive Token',
      status: 403,
    });
    const err = toWalletError(sdkError);
    expect(err).toBeInstanceOf(WalletError);
    expect(err.message).toBe('Inactive Token');
    expect(err.status).toBe(403);
  });

  it('falls back to the message, then a default', () => {
    expect(toWalletError(new Error('socket hang up')).message).toBe('socket hang up');
    expect(toWalletError(undefined).message).toBe('Wallet request failed');
    expect(toWalletError({}).message).toBe('Wallet request failed');
  });

  it('passes a WalletError through', () => {
    const err = new WalletError('x', 400);
    expect(toWalletError(err)).toBe(err);
  });
});
