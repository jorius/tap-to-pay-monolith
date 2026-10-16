import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { BuyerSales, BuyerView } from '@/api/types';
import { Initials } from '@/components/buyer/initials';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    leftToday: 'Disponible hoy',
    period: 'Periodo',
    today: 'Hoy',
    week: 'Semana',
    empty: 'Sin cobros en este periodo.',
    onlyCharged:
      'Solo aparecen los cobros que llegaron a tu billetera o están en curso. Un cobro rechazado por una regla no queda a tu nombre.',
    live: 'Se actualiza cada 3 s mientras esta pantalla está abierta.',
    status: { PAID: 'PAGADO', CHARGING: 'COBRANDO' } as Record<string, string>,
  },
  {
    leftToday: 'Left today',
    period: 'Period',
    today: 'Today',
    week: 'Week',
    empty: 'No charges in this period.',
    onlyCharged:
      'Only charges that reached your wallet or are in progress appear. A charge refused by a rule is never recorded under your name.',
    live: 'Refreshes every 3 s while this screen is open.',
    status: { PAID: 'PAID', CHARGING: 'CHARGING' } as Record<string, string>,
  },
);

type Period = 'today' | 'week';

// The buyer's charges (design: BuyerHistory), re-read every 3 s while focused (SDD §6). The service returns the last 20;
// the period filter runs on the phone over those.
export default function HistoryScreen() {
  const { buyerId } = useSession();
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const [period, setPeriod] = useState<Period>('today');
  const buyer = useApi<BuyerView>(`/buyers/${buyerId}`).data;
  const { data, error, loading, reload } = useApi<BuyerSales>(`/buyers/${buyerId}/sales`, { pollMs: 3000 });

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (period === 'week') since.setDate(since.getDate() - 6);
  const sales = data?.sales.filter((sale) => new Date(sale.createdAt) >= since) ?? [];

  return (
    <Screen>
      <View style={[styles.left, { backgroundColor: theme.card }]}>
        <ThemedText type="caption" style={styles.leftLabel}>
          {t.leftToday}
        </ThemedText>
        <Text style={[styles.leftAmount, { color: theme.text }]}>
          {data && buyer ? formatMoney(data.remainingToday, buyer.assetScale, buyer.assetCode, lang) : '—'}
        </Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t.period} style={styles.periods}>
        {(['today', 'week'] as const).map((p) => {
          const selected = p === period;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPeriod(p)}
              style={[
                styles.period,
                selected
                  ? { backgroundColor: theme.text, borderColor: theme.text }
                  : { backgroundColor: 'transparent', borderColor: theme.border },
              ]}>
              <Text style={[styles.periodText, { color: selected ? theme.background : theme.text }]}>
                {p === 'today' ? t.today : t.week}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <LoadState loading={loading} error={error} hasData={data !== undefined} onRetry={reload} />
      {data && sales.length === 0 && <ThemedText type="caption">{t.empty}</ThemedText>}
      {sales.map((sale) => (
        <View key={sale.id} style={[styles.row, { borderBottomColor: theme.border }]}>
          <Initials name={sale.vendorName ?? '?'} size={40} background={theme.vendorTint} color={theme.vendorInk} />
          <View style={styles.info}>
            <ThemedText style={styles.vendor}>{sale.vendorName ?? '—'}</ThemedText>
            <ThemedText type="caption">{when(sale.createdAt, lang, t.today)}</ThemedText>
          </View>
          <View style={styles.amountBox}>
            <Text style={[styles.amount, { color: theme.text }]}>
              −{formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang)}
            </Text>
            <StatusPill tone={sale.status === 'PAID' ? 'ok' : 'wait'} label={t.status[sale.status] ?? sale.status} />
          </View>
        </View>
      ))}

      <ThemedText type="caption">{t.onlyCharged}</ThemedText>
      <View style={styles.live}>
        <View style={styles.liveDot} />
        <ThemedText type="caption">{t.live}</ThemedText>
      </View>
    </Screen>
  );
}

// "Hoy · 15:04" for today, "16 oct · 15:04" before that, in the phone's time zone.
function when(iso: string, lang: Lang, todayLabel: string) {
  const date = new Date(iso);
  const locale = lang === 'es' ? 'es-CO' : 'en-US';
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day =
    date.toDateString() === new Date().toDateString()
      ? todayLabel
      : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

const styles = StyleSheet.create({
  left: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 },
  leftLabel: { fontWeight: '600' },
  leftAmount: { fontSize: 22, fontWeight: '800' },
  periods: { flexDirection: 'row', gap: 8 },
  period: { minHeight: 44, justifyContent: 'center', borderWidth: 2, borderRadius: 999, paddingHorizontal: 16 },
  periodText: { fontSize: 14, fontWeight: '700' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 8 },
  info: { flex: 1, gap: 2 },
  vendor: { fontSize: 16, fontWeight: '700' },
  amountBox: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 16, fontWeight: '800' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.buyer },
});
