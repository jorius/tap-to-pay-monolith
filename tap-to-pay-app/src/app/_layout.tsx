import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ConnectionDot } from '@/components/connection-label';
import { HeaderTitle } from '@/components/header-title';
import { HealthProvider } from '@/hooks/use-health';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

export default function RootLayout() {
  return (
    <SessionProvider>
      <HealthProvider>
        <Navigation />
      </HealthProvider>
    </SessionProvider>
  );
}

function Navigation() {
  const scheme = useScheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = useTheme();
  const t = useCopy(commonCopy);
  const { debugLabels } = useSession();
  // Headers and screen transitions use the app palette, so nothing flashes a different background.
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: theme.background, card: theme.background, text: theme.text, border: theme.border },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerRight: debugLabels ? () => <ConnectionDot /> : undefined,
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="vendor/index" options={{ headerTitle: () => <HeaderTitle title={t.titles.vendor} /> }} />
        <Stack.Screen name="vendor/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="vendor/wallets" options={{ headerTitle: () => <HeaderTitle title={t.titles.wallets} /> }} />
        <Stack.Screen name="buyer/index" options={{ headerTitle: () => <HeaderTitle title={t.titles.buyer} /> }} />
        <Stack.Screen name="buyer/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="buyer/grant" options={{ headerTitle: () => <HeaderTitle title={t.titles.grant} /> }} />
        <Stack.Screen name="buyer/limits" options={{ headerTitle: () => <HeaderTitle title={t.titles.limits} /> }} />
        <Stack.Screen name="buyer/activate" options={{ headerTitle: () => <HeaderTitle title={t.titles.activate} /> }} />
        <Stack.Screen name="grant-finish" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="settings" options={{ headerTitle: () => <HeaderTitle title={t.titles.settings} /> }} />
        <Stack.Screen
          name="debug"
          options={{ headerTitle: () => <HeaderTitle title={t.titles.debug} />, headerRight: undefined }}
        />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
