import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@/api/client';
import type { SaleView } from '@/api/types';
import { NfcTap } from '@/nfc/nfc-tap';

// The vendor sale state machine of SDD section 6.
export type SaleState = 'idle' | 'awaiting_tap' | 'nfc_error' | 'charging' | 'paid' | 'failed' | 'not_confirmed';

// Whether this phone can read the buyer's card for the sale on screen. Without it the sale still waits, to be paid through
// its QR or WhatsApp link (SDD §10, "Payment links and QR").
export type ReaderState = 'on' | 'no_nfc' | 'nfc_off' | 'no_module';

// What fails on the phone before or around a charge; refusals by the service arrive on the sale instead.
export type AppFailure = { code: 'NO_NFC' | 'NFC_OFF' | 'NO_NFC_MODULE' | 'API'; error?: ApiError };

type Snapshot = {
  state: SaleState;
  sale: SaleView | null;
  walletAddress: string | null;
  nfcError: string | null;
  failure: AppFailure | null;
  reader: ReaderState;
};

const RESET: Omit<Snapshot, 'state'> = { sale: null, walletAddress: null, nfcError: null, failure: null, reader: 'on' };
const POLL_MS = 1000;
const MAX_POLLS = 30;
// While waiting for a tap, how often the sale is re-read: its payment link (WhatsApp or QR) can charge it meanwhile.
const WATCH_MS = 2000;
// The charge blocks up to CHARGE_POLL_SECONDS plus wallet latency (SDD §9).
const CHARGE_TIMEOUT_MS = 30_000;
// A sale left not confirmed is re-read this often until it settles (design: "Seguimos revisando solos").
const RECHECK_MS = 3000;
// charge() starts from the keypad, or again from a settled sale ("Intentar de nuevo" skips the keypad).
const RESTARTABLE: SaleState[] = ['idle', 'failed', 'not_confirmed'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const toApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e), 0));

// Every phone can create sales: one without NFC (or with NFC off) is paid through the sale's QR or WhatsApp link. With
// debug labels on, a phone without the NfcTap module also gets the simulated tap.
export function useSale(vendorId: string) {
  const [snap, setSnap] = useState<Snapshot>({ state: 'idle', ...RESET });
  const [starting, setStarting] = useState(false);
  const stateRef = useRef<SaleState>('idle');
  const saleRef = useRef<SaleView | null>(null);
  const startingRef = useRef(false);
  // Bumped by every new sale, cancel and unmount, so a charge or poll left running never writes over a newer sale.
  const runRef = useRef(0);

  // Every transition goes through go(), which updates the ref before React commits: native NFC events can queue
  // behind each other (SDD §6).
  const go = useCallback((state: SaleState, patch: Partial<Omit<Snapshot, 'state'>> = {}) => {
    console.log(`[nfc] sale -> ${state}`);
    stateRef.current = state;
    if (patch.sale !== undefined) saleRef.current = patch.sale;
    setSnap((current) => ({ ...current, ...patch, state }));
  }, []);

  const finish = useCallback(
    (sale: SaleView) => {
      if (sale.status === 'PAID') go('paid', { sale });
      else if (sale.status === 'FAILED') go('failed', { sale, failure: null });
      // Still AWAITING_TAP after a lost charge call: it never ran, and the failure kept from that call says why.
      else if (sale.status === 'AWAITING_TAP') go('failed', { sale });
      else go('not_confirmed', { sale });
    },
    [go],
  );

  // GET /sales/:id every second while CHARGING, at most 30 times; a failed read never fails the sale (SDD §15.12).
  const poll = useCallback(
    async (id: string, run: number) => {
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        if (runRef.current !== run) return;
        try {
          const sale = await api<SaleView>(`/sales/${id}`);
          if (runRef.current !== run) return;
          if (sale.status !== 'CHARGING') return finish(sale);
        } catch {
          // keep polling: the payment may still land
        }
      }
      if (runRef.current === run) go('not_confirmed');
    },
    [finish, go],
  );

  // GET /sales/:id once more from not_confirmed ("Revisar ahora" and the timer below); a newer sale discards it.
  const recheck = useCallback(async () => {
    const sale = saleRef.current;
    const run = runRef.current;
    if (!sale || stateRef.current !== 'not_confirmed' || startingRef.current) return;
    try {
      const fresh = await api<SaleView>(`/sales/${sale.id}`);
      if (runRef.current === run && stateRef.current === 'not_confirmed' && !startingRef.current) finish(fresh);
    } catch {
      // still unreachable: the next tick tries again
    }
  }, [finish]);

  const tap = useCallback(
    async (walletAddress: string) => {
      const sale = saleRef.current;
      const state = stateRef.current;
      // A second tap during a charge, or a tap with no sale waiting, is ignored.
      if (!sale || (state !== 'awaiting_tap' && state !== 'nfc_error')) {
        console.log(`[nfc] card ignored in ${state}`);
        return;
      }
      // The reader stays on (the vendor tabs own it), so a second tap during the charge is just ignored above.
      const run = runRef.current;
      go('charging', { walletAddress });

      let charged: SaleView;
      try {
        charged = await api<SaleView>(`/sales/${sale.id}/charge`, {
          method: 'POST',
          body: { walletAddress },
          timeoutMs: CHARGE_TIMEOUT_MS,
        });
      } catch (e) {
        const failure: AppFailure = { code: 'API', error: toApiError(e) };
        // The charge may have run and only its answer was lost: a sale past AWAITING_TAP is polled, not failed.
        try {
          charged = await api<SaleView>(`/sales/${sale.id}`);
        } catch {
          // Neither answer arrived, so the payment may still land: "Not confirmed, check the wallet", never
          // "Not paid", which would invite a second charge.
          if (runRef.current === run) go('not_confirmed', { failure });
          return;
        }
        if (charged.status === 'AWAITING_TAP') {
          if (runRef.current === run) go('failed', { failure });
          return;
        }
      }
      if (runRef.current !== run) return;
      if (charged.status === 'CHARGING') {
        go('charging', { sale: charged });
        poll(charged.id, run);
      } else {
        finish(charged);
      }
    },
    [finish, go, poll],
  );

  const charge = useCallback(
    async (amount: string) => {
      if (!RESTARTABLE.includes(stateRef.current) || startingRef.current) return;
      // RESET drops the settled sale a retry starts from, so its refusal never shows next to the new failure.
      const fail = (failure: AppFailure) => go('failed', { ...RESET, failure });
      // No NFC is no longer a dead end: the sale is created anyway and paid through its QR or WhatsApp link.
      const reader: ReaderState = !NfcTap
        ? 'no_module'
        : !NfcTap.isSupported()
          ? 'no_nfc'
          : !NfcTap.isEnabled()
            ? 'nfc_off'
            : 'on';
      const run = ++runRef.current;
      startingRef.current = true;
      setStarting(true);
      try {
        const sale = await api<SaleView>('/sales', { method: 'POST', body: { vendorId, amount } });
        if (runRef.current !== run) return;
        // Normally already on; re-enabling is harmless and covers a reader that failed to start with the tabs.
        if (reader === 'on') NfcTap?.startReader();
        go('awaiting_tap', { ...RESET, sale, reader });
      } catch (e) {
        if (runRef.current === run) fail({ code: 'API', error: toApiError(e) });
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
    },
    [go, vendorId],
  );

  // Cancel leaves the sale AWAITING_TAP, which never counts toward a limit (SDD §8); New sale uses it too.
  const reset = useCallback(() => {
    runRef.current++;
    go('idle', RESET);
  }, [go]);

  useEffect(() => {
    if (!NfcTap) return;
    const card = NfcTap.addListener('onCard', ({ payload }) => {
      console.log(`[nfc] onCard payload=${payload}`);
      tap(payload);
    });
    const error = NfcTap.addListener('onError', ({ message }) => {
      console.log(`[nfc] onError ${message}`);
      // The reader stays on: the next card moves the sale to charging.
      if (stateRef.current === 'awaiting_tap' || stateRef.current === 'nfc_error') go('nfc_error', { nfcError: message });
    });
    return () => {
      card.remove();
      error.remove();
    };
  }, [go, tap]);

  useEffect(() => {
    if (snap.state !== 'not_confirmed') return;
    const timer = setInterval(recheck, RECHECK_MS);
    return () => clearInterval(timer);
  }, [snap.state, recheck]);

  // A sale waiting for a tap can also be charged through its payment link. Re-read it, and once it leaves AWAITING_TAP
  // follow it as if it had been tapped. A tap moves the state to charging first, so the two never both follow a sale.
  const waitingId = snap.state === 'awaiting_tap' || snap.state === 'nfc_error' ? snap.sale?.id : undefined;
  useEffect(() => {
    if (!waitingId) return;
    const run = runRef.current;
    const waiting = () => runRef.current === run && (stateRef.current === 'awaiting_tap' || stateRef.current === 'nfc_error');
    const timer = setInterval(async () => {
      if (!waiting()) return;
      let sale: SaleView;
      try {
        sale = await api<SaleView>(`/sales/${waitingId}`);
      } catch {
        return; // the next read tries again
      }
      if (!waiting() || sale.status === 'AWAITING_TAP') return;
      console.log(`[nfc] sale ${sale.id} charged through its payment link: ${sale.status}`);
      if (sale.status === 'CHARGING') {
        go('charging', { sale, walletAddress: null });
        poll(sale.id, run);
      } else {
        finish(sale);
      }
    }, WATCH_MS);
    return () => clearInterval(timer);
  }, [finish, go, poll, waitingId]);

  useEffect(
    () => () => {
      runRef.current++;
    },
    [],
  );

  return { ...snap, starting, charge, tap, reset, recheck };
}
