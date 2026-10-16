import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/api/client';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { errorText } from '@/components/vendor/format';
import { Brand, Fill } from '@/constants/theme';
import { useCopy } from '@/i18n';

export function LoadingState() {
  const t = useCopy(vendorCopy);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Brand.vendor} accessibilityLabel={t.loading} />
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const t = useCopy(vendorCopy);
  return (
    <ThemedView card accessibilityRole="alert">
      <StatusPill tone="bad" label={error.code} />
      <ThemedText>{errorText(error, t.network)}</ThemedText>
      <BigButton label={t.retry} color={Fill.vendor} onPress={onRetry} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 32, alignItems: 'center' },
});
