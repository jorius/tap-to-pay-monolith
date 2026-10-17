import {
  createAuthenticatedClient,
  isFinalizedGrantWithAccessToken,
  isPendingGrant,
  type AuthenticatedClient,
} from '@interledger/open-payments';
import type { Amount } from '../services/money.js';
import {
  toWalletError,
  WalletError,
  type OpenPayments,
  type OutgoingGrantRequest,
  type PendingGrant,
  type RotatedToken,
  type WalletInfo,
} from './types.js';

export type OpenPaymentsConfig = {
  walletAddressUrl: string;
  keyId: string;
  privateKeyPath: string;
};

export function createSdkClient(cfg: OpenPaymentsConfig): Promise<AuthenticatedClient> {
  return createAuthenticatedClient({
    walletAddressUrl: cfg.walletAddressUrl,
    keyId: cfg.keyId,
    privateKey: cfg.privateKeyPath,
    requestTimeoutMs: 15_000,
  });
}

export async function createOpenPayments(cfg: OpenPaymentsConfig): Promise<OpenPayments> {
  return new SdkOpenPayments(await createSdkClient(cfg));
}

/** Every request is signed with the service key; SDK errors surface as one WalletError. */
class SdkOpenPayments implements OpenPayments {
  constructor(private readonly client: AuthenticatedClient) {}

  getWalletAddress(url: string) {
    return wrap(async (): Promise<WalletInfo> => {
      const w = await this.client.walletAddress.get({ url });
      return {
        id: w.id,
        publicName: w.publicName ?? null,
        authServer: w.authServer,
        resourceServer: w.resourceServer,
        assetCode: w.assetCode,
        assetScale: w.assetScale,
      };
    });
  }

  createIncomingPayment(vendor: WalletInfo, amount: Amount) {
    return wrap(async () => {
      const accessToken = await this.nonInteractiveToken(vendor, 'incoming-payment');
      const payment = await this.client.incomingPayment.create(
        { url: vendor.resourceServer, accessToken },
        { walletAddress: vendor.id, incomingAmount: amount },
      );
      return payment.id;
    });
  }

  createQuote(buyer: WalletInfo, receiverUrl: string) {
    return wrap(async () => {
      const accessToken = await this.nonInteractiveToken(buyer, 'quote');
      const quote = await this.client.quote.create(
        { url: buyer.resourceServer, accessToken },
        { walletAddress: buyer.id, receiver: receiverUrl, method: 'ilp' },
      );
      return {
        id: quote.id,
        debitAmount: BigInt(quote.debitAmount.value),
        assetCode: quote.debitAmount.assetCode,
        assetScale: quote.debitAmount.assetScale,
      };
    });
  }

  createOutgoingPayment(buyer: WalletInfo, quoteId: string, accessToken: string) {
    return wrap(async () => {
      const payment = await this.client.outgoingPayment.create(
        { url: buyer.resourceServer, accessToken },
        { walletAddress: buyer.id, quoteId },
      );
      return payment.id;
    });
  }

  rotateToken(manageUrl: string, accessToken: string) {
    return wrap(async () => {
      const { access_token } = await this.client.token.rotate({ url: manageUrl, accessToken });
      return { value: access_token.value, manage: access_token.manage };
    });
  }

  getIncomingPayment(url: string) {
    return wrap(async () => {
      const payment = await this.client.incomingPayment.getPublic({ url });
      if (!payment.receivedAmount) throw new WalletError('Wallet did not report a received amount');
      // The public view has no `completed`; callers compare receivedAmount with the sale amount.
      return { receivedAmount: BigInt(payment.receivedAmount.value), completed: false };
    });
  }

  requestOutgoingPaymentGrant(wallet: WalletInfo, { dailyDebit, intervalStart, finishUri, clientNonce }: OutgoingGrantRequest) {
    return wrap(async (): Promise<PendingGrant> => {
      const grant = await this.client.grant.request(
        { url: wallet.authServer },
        {
          access_token: {
            access: [
              {
                type: 'outgoing-payment',
                actions: ['create', 'read'],
                identifier: wallet.id,
                limits: {
                  debitAmount: { value: dailyDebit.toString(), assetCode: wallet.assetCode, assetScale: wallet.assetScale },
                  interval: `R/${intervalStart}/P1D`,
                },
              },
            ],
          },
          interact: { start: ['redirect'], finish: { method: 'redirect', uri: finishUri, nonce: clientNonce } },
        },
      );
      if (!isPendingGrant(grant)) throw new WalletError('Expected an interactive grant, got a finalized one');
      return {
        redirect: grant.interact.redirect,
        interactNonce: grant.interact.finish,
        continueUri: grant.continue.uri,
        continueToken: grant.continue.access_token.value,
      };
    });
  }

  continueGrant({ continueUri, continueToken }: Pick<PendingGrant, 'continueUri' | 'continueToken'>, interactRef: string) {
    return wrap(async (): Promise<RotatedToken> => {
      const continued = await this.client.grant.continue(
        { url: continueUri, accessToken: continueToken },
        { interact_ref: interactRef },
      );
      if (!isFinalizedGrantWithAccessToken(continued)) throw new WalletError('The grant did not finalize with a token');
      return { value: continued.access_token.value, manage: continued.access_token.manage };
    });
  }

  revokeToken(manageUrl: string, accessToken: string) {
    return wrap(() => this.client.token.revoke({ url: manageUrl, accessToken }));
  }

  /** Requested on every charge and never cached. */
  private async nonInteractiveToken(wallet: WalletInfo, type: 'incoming-payment' | 'quote') {
    const grant = await this.client.grant.request(
      { url: wallet.authServer },
      { access_token: { access: [{ type, actions: ['create', 'read'] }] } },
    );
    if (isPendingGrant(grant)) {
      throw new WalletError(`Wallet asked for interaction on a ${type} grant`);
    }
    if (!grant.access_token) throw new WalletError(`Wallet returned no token for a ${type} grant`);
    return grant.access_token.value;
  }
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toWalletError(err);
  }
}
