import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';

// The scheme the app draws in: the one picked in Settings, or the phone's.
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const { theme } = useSession();
  if (theme !== 'system') return theme;
  return system === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  return Colors[useScheme()];
}
