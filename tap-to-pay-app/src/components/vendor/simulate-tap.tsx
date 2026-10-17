import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BuyerView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { Brand } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Simular toque (depuración)',
    note: 'Solo con las etiquetas de depuración activas. Envía la billetera del comprador elegido como si hubiera acercado su teléfono: el cobro es real.',
    open: 'Elegir comprador',
    empty: 'El servicio no tiene compradores todavía (npm run seed).',
    grant: 'grant ✓',
    noGrant: 'sin grant',
  },
  {
    title: 'Simulate tap (debug)',
    note: "Debug labels only. Sends the chosen buyer's wallet as if they had held their phone to this one: the charge is real.",
    open: 'Pick a buyer',
    empty: 'The service has no buyers yet (npm run seed).',
    grant: 'grant ✓',
    noGrant: 'no grant',
  },
);

// Stands in for the NFC reader while modules/nfc-tap does not exist, so the whole Open Payments charge can be tried.
export function SimulateTap({ onTap }: { onTap: (walletAddress: string) => void }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const [open, setOpen] = useState(false);
  const buyers = useApi<BuyerView[]>(open ? '/buyers' : null);

  return (
    <ThemedView card style={[styles.box, { borderColor: Brand.tealDark }]}>
      <ThemedText type="subtitle">{t.title}</ThemedText>
      <ThemedText type="caption">{t.note}</ThemedText>
      {!open ? (
        <BigButton label={t.open} color={Brand.tealDark} onPress={() => setOpen(true)} />
      ) : buyers.data ? (
        buyers.data.length === 0 ? (
          <ThemedText>{t.empty}</ThemedText>
        ) : (
          buyers.data.map((buyer) => (
            <Pressable
              key={buyer.id}
              accessibilityRole="button"
              accessibilityLabel={`${t.title}: ${buyer.name}, ${buyer.assetCode}`}
              onPress={() => onTap(buyer.walletAddress)}
              style={({ pressed }) => [styles.buyer, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
              <View style={styles.who}>
                <Text style={[styles.name, { color: theme.text }]}>{buyer.name}</Text>
                <Text style={[styles.asset, { color: theme.muted }]}>{buyer.assetCode}</Text>
              </View>
              <StatusPill tone={buyer.hasGrant ? 'ok' : 'neutral'} label={buyer.hasGrant ? t.grant : t.noGrant} />
            </Pressable>
          ))
        )
      ) : buyers.error ? (
        <ErrorState error={buyers.error} onRetry={buyers.reload} />
      ) : (
        <LoadingState />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed' },
  buyer: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  asset: { fontSize: 13, fontWeight: '700' },
});
