import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove(): void };

// The local Expo Module modules/nfc-tap of SDD section 6. Until it is built this is null, and the screens fall back
// to "NFC unavailable" (or the debug-only simulated tap when debug labels are on).
export type NfcTapModule = {
  isSupported(): boolean;
  isEnabled(): boolean;
  isHceSupported(): boolean;
  setCardPayload(payload: string | null): void;
  getCardPayload(): string | null;
  startReader(): void;
  stopReader(): void;
  addListener(event: 'onCard', listener: (event: { payload: string }) => void): Subscription;
  addListener(event: 'onError', listener: (event: { message: string }) => void): Subscription;
};

export const NfcTap = requireOptionalNativeModule<NfcTapModule>('NfcTap');
