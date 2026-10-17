import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/api/client';

type State<T> = { data?: T; error?: ApiError; loading: boolean };

// GET a path while the screen is focused, optionally re-reading every pollMs (e.g. the buyer history, SDD §6).
// A failed refresh keeps the last data on screen next to the error. Pass null to skip.
export function useApi<T>(path: string | null, { pollMs }: { pollMs?: number } = {}) {
  const [state, setState] = useState<State<T>>({ loading: path !== null });
  const [tick, setTick] = useState(0);
  // reload() settles once the read it triggered lands, so a pull-to-refresh spinner stays up until then.
  const waiting = useRef<(() => void)[]>([]);
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setTick((n) => n + 1);
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      const settle = () => waiting.current.splice(0).forEach((resolve) => resolve());
      if (!path) {
        settle();
        return;
      }
      let alive = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const run = async () => {
        try {
          const data = await api<T>(path);
          if (alive) setState({ data, loading: false });
        } catch (e) {
          const error = e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e), 0);
          if (alive) setState((s) => ({ data: s.data, error, loading: false }));
        }
        if (alive) settle();
        if (alive && pollMs) timer = setTimeout(run, pollMs);
      };
      run();
      return () => {
        alive = false;
        clearTimeout(timer);
      };
      // tick is a dependency on purpose: reload() re-runs the effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, pollMs, tick]),
  );

  // A write that answers with the fresh resource (e.g. a BuyerView) replaces the cached one without a re-read.
  const set = useCallback((data: T) => setState({ data, loading: false }), []);

  return { ...state, reload, set };
}
