import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove(): void };

// The local Expo Module modules/nfc-tap of SDD section 6 (Kotlin, Android only). It is null in an APK built before the
// module existed, and the screens then fall back to "NFC unavailable" (or the debug-only simulated tap).
export type NfcTapModule = {
  isSupported(): boolean;
  isEnabled(): boolean;
  isHceSupported(): boolean;
  setCardPayload(payload: string | null): void;
  getCardPayload(): string | null;
  // The card on the Tarjeta screen answers taps while the app is in front; null falls back to the stored one.
  setShownCard(payload: string | null): void;
  startReader(): void;
  stopReader(): void;
  addListener(event: 'onCard', listener: (event: { payload: string }) => void): Subscription;
  addListener(event: 'onError', listener: (event: { message: string }) => void): Subscription;
};

export const NfcTap = requireOptionalNativeModule<NfcTapModule>('NfcTap');
