import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/api/client';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    retry: 'Reintentar',
    network: 'Revisa que el servicio esté corriendo y que EXPO_PUBLIC_API_URL apunte a la IP del portátil.',
  },
  {
    retry: 'Retry',
    network: 'Check that the service is running and that EXPO_PUBLIC_API_URL points at the laptop IP.',
  },
);

type Props = { loading: boolean; error?: ApiError; hasData: boolean; onRetry: () => void };

// A spinner while the first GET runs; after a failure the service's message, plus Retry when nothing is on screen yet.
export function LoadState({ loading, error, hasData, onRetry }: Props) {
  const theme = useTheme();
  const t = useCopy(copy);
  if (loading && !hasData) return <ActivityIndicator size="large" color={theme.muted} style={styles.spinner} />;
  if (!error) return null;
  return (
    <View style={styles.box}>
      <StatusPill tone="bad" label={error.message} />
      {error.code === 'NETWORK' && <ThemedText type="caption">{t.network}</ThemedText>}
      {!hasData && <BigButton label={t.retry} color={theme.text} ghost onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 24 },
  box: { gap: 8 },
});
