import { createHash } from 'node:crypto';

export type InteractionHashInput = {
  clientNonce: string;
  interactNonce: string;
  interactRef: string;
  authServer: string;
};

/** The base64 digests we accept: the auth server with and without a trailing slash. */
export function expectedInteractionHashes(input: InteractionHashInput): string[] {
  const bare = input.authServer.replace(/\/+$/, '');
  return [bare, `${bare}/`].map((server) =>
    createHash('sha256')
      .update(`${input.clientNonce}\n${input.interactNonce}\n${input.interactRef}\n${server}`)
      .digest('base64'),
  );
}

/** Accepts base64 or base64url, padded or not. The hash is bound to our nonce, so this costs nothing. */
export function verifyInteractionHash(input: InteractionHashInput & { hash: string }): boolean {
  const received = normalize(input.hash);
  return expectedInteractionHashes(input).some((digest) => normalize(digest) === received);
}

const normalize = (hash: string) => hash.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
