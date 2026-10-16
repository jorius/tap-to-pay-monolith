import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Lang } from '@/i18n';

export type Session = {
  lang: Lang;
  welcomeSeen: boolean;
  vendorId: string | null;
  buyerId: string | null;
  debugLabels: boolean;
};

// The design keeps these on the phone (welcome once, who this phone is, language, debug labels); SDD decision 8 kept
// nothing. Spanish stays the default whatever the system language.
const KEY = 'tap-to-pay/session';
const DEFAULTS: Session = { lang: 'es', welcomeSeen: false, vendorId: null, buyerId: null, debugLabels: true };

type SessionValue = Session & { update: (patch: Partial<Session>) => void };

const SessionContext = createContext<SessionValue | null>(null);

SplashScreen.preventAutoHideAsync();

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setSession({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }))
      // Unreadable storage starts fresh instead of keeping the splash screen up forever.
      .catch(() => setSession(DEFAULTS))
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (session) AsyncStorage.setItem(KEY, JSON.stringify(session)).catch(() => {});
  }, [session]);

  const value = useMemo<SessionValue | null>(
    () =>
      session && {
        ...session,
        update: (patch) => setSession((current) => ({ ...(current ?? DEFAULTS), ...patch })),
      },
    [session],
  );

  if (!value) return null;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
