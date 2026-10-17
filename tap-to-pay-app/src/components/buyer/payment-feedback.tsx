import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, Vibration, View } from 'react-native';

import { buyerAmount } from '@/api/money';
import type { BuyerSales, SaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { useRefusalText } from '@/components/buyer/refusal';
import { Brand, Fill } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    charging: 'Procesando el pago…',
    paid: 'Pago aprobado',
    failed: 'Pago rechazado',
    at: (vendor: string) => `en ${vendor}`,
    done: 'Listo',
  },
  {
    charging: 'Processing the payment…',
    paid: 'Payment approved',
    failed: 'Payment refused',
    at: (vendor: string) => `at ${vendor}`,
    done: 'Done',
  },
);

const POLL_MS = 2000;

// The outcome of each tap on this phone, while the app is open: the newest sale charged to the buyer is polled, and
// any change after the first read (a new sale, or a status move) pops up here. A charge shows up CHARGING and ends PAID
// or FAILED; a refusal by the buyer's limits or missing authorization shows up already FAILED.
export function PaymentFeedback({ buyerId }: { buyerId: string }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const refusal = useRefusalText();
  const { data } = useApi<BuyerSales>(`/buyers/${buyerId}/sales?limit=1`, { pollMs: POLL_MS });
  const [sale, setSale] = useState<SaleView | null>(null);
  // The newest sale already accounted for, as "id:status"; the first read only records it.
  const seen = useRef<string | null>(null);
  const newest = data?.sales[0];
  const key = data ? (newest ? `${newest.id}:${newest.status}` : '') : null;

  useEffect(() => {
    if (key === null || key === seen.current) return;
    const first = seen.current === null;
    seen.current = key;
    if (first || !newest) return;
    setSale(newest);
    if (newest.status === 'PAID') Vibration.vibrate(120);
    if (newest.status === 'FAILED') Vibration.vibrate([0, 200, 120, 200]);
  }, [key, newest]);

  if (!sale) return null;
  const paid = sale.status === 'PAID';
  const failed = sale.status === 'FAILED';
  const color = paid ? theme.okInk : failed ? theme.badInk : theme.text;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setSale(null)}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.background }]}>
          {paid || failed ? (
            <MaterialCommunityIcons name={paid ? 'check-circle-outline' : 'close-circle-outline'} size={96} color={color} />
          ) : (
            <ActivityIndicator size="large" color={Brand.buyer} style={styles.spinner} />
          )}
          <Text accessibilityLiveRegion="polite" style={[styles.title, { color }]}>
            {paid ? t.paid : failed ? t.failed : t.charging}
          </Text>
          <Text style={[styles.amount, { color: theme.text }]}>{buyerAmount(sale, lang)}</Text>
          {sale.vendorName ? <Text style={[styles.detail, { color: theme.muted }]}>{t.at(sale.vendorName)}</Text> : null}
          {failed ? <Text style={[styles.detail, { color: theme.text }]}>{refusal(sale)}</Text> : null}
          <View style={styles.action}>
            <BigButton label={t.done} color={Fill.buyer} onPress={() => setSale(null)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  card: { alignItems: 'center', gap: 8, borderRadius: 24, padding: 24 },
  spinner: { marginVertical: 24, transform: [{ scale: 1.6 }] },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  amount: { fontSize: 32, lineHeight: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: 8 },
});
