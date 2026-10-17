import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { buyerAmount, formatMoney } from '@/api/money';
import type { BuyerSales, SaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { isLimitRefusal, useRefusalText } from '@/components/buyer/refusal';
import { Brand, Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    charging: 'Pagando…',
    paid: 'Pagaste',
    failed: 'No se pagó',
    to: (vendor: string) => `a ${vendor}`,
    at: (vendor: string) => `en ${vendor}`,
    today: (time: string) => `Hoy · ${time}`,
    withdraw: 'Ya puedes retirar el celular',
    leftToday: 'Te quedan para hoy',
    nothingCharged: 'No te descontamos nada',
    why: '¿Por qué?',
    changeLimit: 'Cambiar mi límite',
    done: 'Listo',
    unknown: '¿No reconoces este pago?',
    unknownTitle: '¿No reconoces este pago?',
    unknownBody:
      'Apaga los pagos en Inicio para que este celular deje de pagar, y revisa el cobro en Movimientos. Tu billetera también lo muestra en su página.',
  },
  {
    charging: 'Paying…',
    paid: 'Paid',
    failed: 'Not paid',
    to: (vendor: string) => `to ${vendor}`,
    at: (vendor: string) => `at ${vendor}`,
    today: (time: string) => `Today · ${time}`,
    withdraw: 'You can take your phone away now',
    leftToday: 'Left for today',
    nothingCharged: 'Nothing was charged',
    why: 'Why?',
    changeLimit: 'Change my limit',
    done: 'Done',
    unknown: "Don't recognize this payment?",
    unknownTitle: "Don't recognize this payment?",
    unknownBody:
      'Turn payments off on Home so this phone stops paying, and check the charge in Activity. Your wallet shows it on its page too.',
  },
);

const POLL_MS = 2000;

// The outcome of each tap on this phone, while the app is open: the newest sale charged to the buyer is polled, and
// any change after the first read (a new sale, or a status move) takes the screen. A charge shows up CHARGING and
// ends PAID or FAILED; a refusal by the buyer's limits or missing authorization shows up already FAILED.
export function PaymentFeedback({ buyerId }: { buyerId: string }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const router = useRouter();
  const refusal = useRefusalText();
  const { data } = useApi<BuyerSales>(`/buyers/${buyerId}/sales?limit=1`, { pollMs: POLL_MS });
  const [sale, setSale] = useState<SaleView | null>(null);
  // What the paying wallet has left today, read once the payment landed (the poll only knows the default wallet's).
  const [left, setLeft] = useState<string | null>(null);
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
    setLeft(null);
    if (newest.status === 'PAID') {
      Vibration.vibrate(120);
      if (newest.buyerWalletId) {
        api<BuyerSales>(`/buyers/${buyerId}/sales?walletId=${encodeURIComponent(newest.buyerWalletId)}&limit=1`).then(
          (sales) => setLeft(sales.remainingToday),
          () => {},
        );
      }
    }
    if (newest.status === 'FAILED') Vibration.vibrate([0, 200, 120, 200]);
  }, [key, newest, buyerId]);

  if (!sale) return null;
  const paid = sale.status === 'PAID';
  const failed = sale.status === 'FAILED';
  const vendor = sale.vendorName ?? '—';
  const dismiss = () => setSale(null);
  const time = new Date(sale.paidAt ?? sale.createdAt).toLocaleTimeString(lang === 'es' ? 'es-CO' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={styles.body}>
          {paid || failed ? (
            <View style={[styles.ring, { backgroundColor: `${paid ? theme.income : theme.refused}33` }]}>
              <View style={[styles.disc, { backgroundColor: paid ? Fills.income : Fills.refused }]}>
                <MaterialCommunityIcons name={paid ? 'check' : 'close'} size={56} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <ActivityIndicator size="large" color={Brand.teal} style={styles.spinner} />
          )}
          {/* Approved shows money leaving in red with its sign; a refusal is all grey, never styled as a success. */}
          <Text style={[styles.title, { color: paid ? theme.income : failed ? theme.refused : theme.text }]}>
            {paid ? t.paid : failed ? t.failed : t.charging}
          </Text>
          <Text style={[styles.amount, { color: paid ? theme.outflow : failed ? theme.refused : theme.text }]}>
            {paid ? '−' : ''}
            {buyerAmount(sale, lang)}
          </Text>
          <Text style={[styles.vendor, { color: theme.text }]}>{failed ? t.at(vendor) : t.to(vendor)}</Text>
          {paid && <Text style={[styles.detail, { color: theme.muted }]}>{t.today(time)}</Text>}
          {failed && <Text style={[styles.detail, { color: theme.muted }]}>{t.nothingCharged}</Text>}

          {!paid && !failed && (
            <View style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.pillText, { color: theme.text }]}>{t.withdraw}</Text>
            </View>
          )}
          {paid && left !== null && (
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.detail, { color: theme.muted }]}>{t.leftToday}</Text>
              <Text style={[styles.left, { color: theme.text }]}>
                {formatMoney(left, sale.debitAssetScale ?? sale.assetScale, sale.debitAssetCode ?? sale.assetCode, lang)}
              </Text>
            </View>
          )}
          {failed && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.why, { color: theme.muted }]}>{t.why}</Text>
              <Text style={[styles.reason, { color: theme.text }]}>{refusal(sale)}</Text>
            </View>
          )}
        </View>

        {(paid || failed) && (
          <View style={styles.actions}>
            {failed && isLimitRefusal(sale) ? (
              <>
                <BigButton
                  label={t.changeLimit}
                  color={Fills.primary}
                  onPress={() => {
                    dismiss();
                    router.push('/buyer/limits');
                  }}
                />
                <BigButton label={t.done} color={theme.text} ghost onPress={dismiss} />
              </>
            ) : (
              <BigButton label={t.done} color={Fills.primary} onPress={dismiss} />
            )}
            {paid && (
              <Pressable
                accessibilityRole="button"
                onPress={() => Alert.alert(t.unknownTitle, t.unknownBody)}
                style={styles.link}
                hitSlop={8}>
                <Text style={[styles.linkText, { color: theme.primaryInk }]}>{t.unknown}</Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  ring: { width: 144, height: 144, borderRadius: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  disc: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  spinner: { marginBottom: 40, transform: [{ scale: 2.4 }] },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  amount: { fontSize: 44, lineHeight: 52, fontWeight: '700', fontVariant: ['tabular-nums'] },
  vendor: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  detail: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  pill: { marginTop: 24, borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  pillText: { fontSize: 15, fontWeight: '600' },
  card: { alignSelf: 'stretch', marginTop: 24, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  left: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  why: { fontSize: 13, fontWeight: '600' },
  reason: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  actions: { gap: 10 },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600' },
});
