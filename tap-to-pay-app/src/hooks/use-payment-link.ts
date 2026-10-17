import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/api/client';
import type { PaymentLinkView } from '@/api/types';

type State = { saleId?: string; link?: PaymentLinkView; error?: ApiError; loading?: boolean };

// The payment link of one sale (SDD §10, "Payment links and QR"), asked for once, on the vendor's first share. The
// service hands back the same code while it is live, so asking again is harmless. State belongs to the sale it was
// asked for, so a new sale starts without a link.
export function usePaymentLink(saleId: string | undefined, lang: 'es' | 'en') {
  const [state, setState] = useState<State>({});
  const pending = useRef<{ saleId: string; promise: Promise<PaymentLinkView | null> } | null>(null);
  const current: State = state.saleId === saleId ? state : {};

  const ensure = useCallback(async (): Promise<PaymentLinkView | null> => {
    if (!saleId) return null;
    if (state.saleId === saleId && state.link) return state.link;
    if (pending.current?.saleId === saleId) return pending.current.promise;
    const promise = (async () => {
      setState({ saleId, loading: true });
      try {
        const link = await api<PaymentLinkView>(`/sales/${saleId}/payment-link`, { method: 'POST', body: { lang } });
        setState({ saleId, link });
        return link;
      } catch (e) {
        setState({ saleId, error: e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e), 0) });
        return null;
      } finally {
        if (pending.current?.saleId === saleId) pending.current = null;
      }
    })();
    pending.current = { saleId, promise };
    return promise;
  }, [lang, saleId, state]);

  return { link: current.link ?? null, error: current.error ?? null, loading: current.loading ?? false, ensure };
}
