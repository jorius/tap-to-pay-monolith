import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInteractionHash } from '../src/open-payments/hash.js';

const base = {
  clientNonce: 'client-nonce',
  interactNonce: 'interact-nonce',
  interactRef: 'ref-123',
  authServer: 'https://auth.test',
};
const digest = (server: string) =>
  createHash('sha256')
    .update(`${base.clientNonce}\n${base.interactNonce}\n${base.interactRef}\n${server}`)
    .digest('base64');
const toUrl = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('verifyInteractionHash', () => {
  it('accepts base64', () => {
    expect(verifyInteractionHash({ ...base, hash: digest('https://auth.test') })).toBe(true);
  });

  it('accepts base64url and unpadded', () => {
    expect(verifyInteractionHash({ ...base, hash: toUrl(digest('https://auth.test')) })).toBe(true);
    expect(verifyInteractionHash({ ...base, hash: digest('https://auth.test').replace(/=+$/, '') })).toBe(true);
  });

  it('accepts the auth server with or without a trailing slash', () => {
    expect(verifyInteractionHash({ ...base, hash: digest('https://auth.test/') })).toBe(true);
    expect(
      verifyInteractionHash({ ...base, authServer: 'https://auth.test/', hash: digest('https://auth.test') }),
    ).toBe(true);
  });

  it('rejects a hash for another reference or nonce', () => {
    expect(verifyInteractionHash({ ...base, interactRef: 'other', hash: digest('https://auth.test') })).toBe(false);
    expect(verifyInteractionHash({ ...base, clientNonce: 'other', hash: digest('https://auth.test') })).toBe(false);
  });
});
