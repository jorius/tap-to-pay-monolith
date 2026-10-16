import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError } from '@/api/client';
import type { Health } from '@/api/types';

const POLL_MS = 5000;

export type HealthState =
  | { status: 'checking' }
  | { status: 'connected'; latencyMs: number; clientWalletAddress: string }
  | { status: 'unreachable'; code: string; message: string };

const HealthContext = createContext<HealthState>({ status: 'checking' });

// One poller for the whole app; every connection label reads it from context.
export function HealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>({ status: 'checking' });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const started = Date.now();
      let next: HealthState;
      try {
        const health = await api<Health>('/health');
        next = { status: 'connected', latencyMs: Date.now() - started, clientWalletAddress: health.clientWalletAddress };
      } catch (e) {
        next = {
          status: 'unreachable',
          code: e instanceof ApiError ? e.code : 'UNKNOWN',
          message: e instanceof Error ? e.message : String(e),
        };
      }
      if (!alive) return;
      setState(next);
      // Schedule after the answer, so a slow check never overlaps the next one.
      timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return <HealthContext.Provider value={state}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  return useContext(HealthContext);
}
