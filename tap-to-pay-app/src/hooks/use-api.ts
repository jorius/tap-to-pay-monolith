import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, ApiError } from '@/api/client';

type State<T> = { data?: T; error?: ApiError; loading: boolean };

// GET a path while the screen is focused, optionally re-reading every pollMs (e.g. the buyer history, SDD §6).
// A failed refresh keeps the last data on screen next to the error. Pass null to skip.
export function useApi<T>(path: string | null, { pollMs }: { pollMs?: number } = {}) {
  const [state, setState] = useState<State<T>>({ loading: path !== null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (!path) return;
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

  return { ...state, reload };
}
