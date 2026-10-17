import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { SummaryRange, VendorSaleView, VendorSummary, VendorView, VendorWalletView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChart, type Bar } from '@/components/vendor/bar-chart';
import { FilterChips } from '@/components/vendor/chips';
import { fill, locale, walletSite } from '@/components/vendor/format';
import { SaleRow } from '@/components/vendor/sale-row';
import { StatementCard } from '@/components/vendor/statement-card';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { defaultFirst, vendorWallets, walletLabel } from '@/components/vendor/wallets';
import { roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    wallet: 'Billetera',
    period: 'Periodo',
    ranges: { today: 'Hoy', week: 'Semana', month: 'Mes' },
    balanceTitle: 'Balance según ventas registradas',
    balanceNote: 'Suma de las ventas PAGADAS {span} en el servicio. Tu saldo real está en tu billetera.',
    spans: { today: 'de hoy', week: 'de los últimos 7 días', month: 'de los últimos 30 días' },
    seeWallet: 'Ver saldo en tu billetera',
    plTitle: { today: 'Resultado del día', week: 'Resultado de 7 días', month: 'Resultado de 30 días' },
    paidSales: 'Ventas cobradas · {n}',
    pending: 'Pendientes por confirmar · {n}',
    failed: 'Cobros fallidos · {n}',
    notCounted: 'no suman',
    fees: 'Comisiones de red',
    netReceived: 'Neto recibido',
    byHour: 'Ventas por hora',
    byDay: 'Ventas por día',
    avgTicket: 'Ticket promedio',
    chartBusiest: '{title}; el punto más alto es {label} con {amount}',
    chartEmpty: '{title}; sin ventas en este periodo',
    lastSales: 'Últimas ventas',
    noSales: 'Aún no hay ventas.',
    allTx: 'Ver todos los movimientos',
  },
  {
    wallet: 'Wallet',
    period: 'Period',
    ranges: { today: 'Today', week: 'Week', month: 'Month' },
    balanceTitle: 'Balance from recorded sales',
    balanceNote: 'Sum of the PAID sales {span} in the service. Your real balance lives in your wallet.',
    spans: { today: 'of today', week: 'of the last 7 days', month: 'of the last 30 days' },
    seeWallet: 'See balance in your wallet',
    plTitle: { today: "Today's result", week: 'Last 7 days', month: 'Last 30 days' },
    paidSales: 'Paid sales · {n}',
    pending: 'Pending confirmation · {n}',
    failed: 'Failed charges · {n}',
    notCounted: 'not counted',
    fees: 'Network fees',
    netReceived: 'Net received',
    byHour: 'Sales by hour',
    byDay: 'Sales by day',
    avgTicket: 'Average ticket',
    chartBusiest: '{title}; the highest point is {label} with {amount}',
    chartEmpty: '{title}; no sales in this period',
    lastSales: 'Latest sales',
    noSales: 'No sales yet.',
    allTx: 'See all transactions',
  },
);

const RANGES: SummaryRange[] = ['today', 'week', 'month'];

export default function DashboardScreen() {
  return <VendorGate>{(vendor, _replace, reload) => <Dashboard vendor={vendor} reload={reload} />}</VendorGate>;
}

// The panel (design: Panel y balance), for one receiving wallet at a time so totals never mix assets. The balance is the
// service's ledger of PAID sales: Open Payments exposes no wallet balance, so the real one is only ever "in your wallet".
function Dashboard({ vendor, reload }: { vendor: VendorView; reload: () => Promise<void> }) {
  const t = useCopy(copy);
  const theme = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<SummaryRange>('today');
  const wallets = defaultFirst(vendorWallets(vendor));
  const [walletId, setWalletId] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  // Starts on the receiving wallet; a wallet removed in the Billetera tab falls back to it too.
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
  const latest = useApi<VendorSaleView[]>(`/vendors/${vendor.id}/sales?limit=3&walletId=${wallet.id}&direction=in`);

  return (
    <Screen
      onRefresh={() => {
        setRefreshes((n) => n + 1);
        return Promise.all([reload(), latest.reload()]);
      }}>
      {wallets.length > 1 && (
        <FilterChips
          label={t.wallet}
          options={wallets.map((w) => ({ value: w.id, label: walletLabel(w) }))}
          value={wallet.id}
          onChange={setWalletId}
        />
      )}
      <FilterChips
        label={t.period}
        options={RANGES.map((value) => ({ value, label: t.ranges[value] }))}
        value={range}
        onChange={setRange}
      />
      {/* Keyed by range, wallet and pull-to-refresh so each shows a spinner and re-reads instead of the previous figures. */}
      <Summary key={`${range}:${wallet.id}:${refreshes}`} vendorId={vendor.id} wallet={wallet} range={range} />

      {/* The monthly financial statement for a lender: payment capacity and the month's sales, as a PDF. */}
      <StatementCard vendorId={vendor.id} />

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
          {t.lastSales}
        </Text>
        {latest.data ? (
          latest.data.length === 0 ? (
            <ThemedText type="caption">{t.noSales}</ThemedText>
          ) : (
            latest.data.map((sale) => <SaleRow key={sale.id} sale={sale} />)
          )
        ) : latest.error ? (
          <ErrorState error={latest.error} onRetry={latest.reload} />
        ) : (
          <LoadingState />
        )}
        <LinkButton label={t.allTx} onPress={() => router.navigate('/vendor/transactions')} />
      </View>
    </Screen>
  );
}

function Summary({ vendorId, wallet, range }: { vendorId: string; wallet: VendorWalletView; range: SummaryRange }) {
  const t = useCopy(copy);
  const lang = useLang();
  const theme = useTheme();
  const { data, error, reload } = useApi<VendorSummary>(`/vendors/${vendorId}/summary?range=${range}&walletId=${wallet.id}`);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState />;

  const money = (amount: string) => formatMoney(amount, data.assetScale, data.assetCode, lang);
  const bars = toBars(data, lang);
  const title = range === 'today' ? t.byHour : t.byDay;
  const busiest = bars.reduce<Bar | null>((top, bar) => (bar.total > (top?.total ?? 0) ? bar : top), null);
  const busiestAmount = busiest ? data.buckets.find((b) => b.start === busiest.key)?.total ?? '0' : '0';

  return (
    <>
      <ThemedView card>
        <Text style={[styles.h3, { color: theme.muted }]}>{t.balanceTitle}</Text>
        <Text style={[styles.balance, { color: theme.text }]}>{money(data.paid.total)}</Text>
        <ThemedText type="caption">{fill(t.balanceNote, { span: t.spans[range] })}</ThemedText>
        <LinkButton label={t.seeWallet} external onPress={() => Linking.openURL(walletSite(wallet.walletAddress))} />
      </ThemedView>

      <View style={[styles.pl, { borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
          {t.plTitle[range]}
        </Text>
        <Line label={fill(t.paidSales, { n: String(data.paid.count) })} value={money(data.paid.total)} />
        <Line label={fill(t.pending, { n: String(data.pending.count) })} value={money(data.pending.total)} />
        <Line label={fill(t.failed, { n: String(data.failed.count) })} value={t.notCounted} muted />
        <Line label={t.fees} value={money('0')} />
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <Line label={t.netReceived} value={money(data.paid.total)} strong />
      </View>

      <ThemedView card>
        <View style={styles.chartHead}>
          <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
            {title}
          </Text>
          <ThemedText type="caption">
            {t.avgTicket} <Text style={{ color: theme.text, fontWeight: '700' }}>{money(data.averageTicket)}</Text>
          </ThemedText>
        </View>
        <BarChart
          bars={bars}
          accessibilityLabel={
            busiest
              ? fill(t.chartBusiest, { title, label: busiest.label, amount: money(busiestAmount) })
              : fill(t.chartEmpty, { title })
          }
        />
      </ThemedView>
    </>
  );
}

// Today: 24 hourly buckets shown as 8–18, widened to any hour with sales. Week: a bar per day. Month: a bar per day,
// labelled every fifth day so 30 labels still fit.
function toBars(summary: VendorSummary, lang: Lang): Bar[] {
  const all = summary.buckets.map((b) => ({ key: b.start, start: new Date(b.start), total: Number(b.total), count: b.count }));
  if (summary.range === 'today') {
    const active = all.flatMap((b, i) => (b.count ? [i] : []));
    const from = Math.min(8, ...active);
    const to = Math.max(18, ...active);
    return all.slice(from, to + 1).map((b) => ({ key: b.key, total: b.total, label: String(b.start.getHours()) }));
  }
  if (summary.range === 'week') {
    return all.map((b) => ({ key: b.key, total: b.total, label: b.start.toLocaleDateString(locale(lang), { weekday: 'short' }) }));
  }
  return all.map((b, i) => ({
    key: b.key,
    total: b.total,
    label: (all.length - 1 - i) % 5 === 0 ? String(b.start.getDate()) : '',
  }));
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: theme.text }, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lineValue, { color: muted ? theme.muted : theme.text }, !muted && styles.bold, strong && styles.strong]}>
        {value}
      </Text>
    </View>
  );
}

function LinkButton({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  const theme = useTheme();
  const { ink } = roleColors(theme, 'vendor');
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.linkText, { color: ink }]}>{label}</Text>
      {external && <MaterialCommunityIcons name="open-in-new" size={16} color={ink} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  h2: { fontSize: 16, fontWeight: '800' },
  h3: { fontSize: 14, fontWeight: '700' },
  balance: { fontSize: 40, lineHeight: 46, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pl: { gap: 10, padding: 16, borderWidth: 1, borderRadius: 20 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flexShrink: 1, fontSize: 15 },
  lineValue: { fontSize: 15, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
  strong: { fontSize: 16, fontWeight: '800' },
  rule: { height: 1 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  link: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontSize: 15, fontWeight: '700' },
});
