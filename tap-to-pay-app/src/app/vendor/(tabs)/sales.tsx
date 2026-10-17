import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { SummaryRange, VendorSaleView, VendorSummary, VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { FilterChips } from '@/components/vendor/chips';
import { vendorCopy } from '@/components/vendor/copy';
import { walletSite } from '@/components/vendor/format';
import { SaleRow } from '@/components/vendor/sale-row';
import { SaleSheet } from '@/components/vendor/sale-sheet';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { defaultFirst, vendorWallets, walletName } from '@/components/vendor/wallets';
import { Brand } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    wallet: 'Billetera',
    range: 'Periodo',
    ranges: { today: 'Hoy', week: 'Semana', month: 'Mes' },
    received: { today: 'Recibiste hoy', week: 'Recibiste esta semana', month: 'Recibiste este mes' },
    inSales: (n: number) => (n === 1 ? 'en 1 venta' : `en ${n} ventas`),
    vsYesterday: { more: 'más que ayer', less: 'menos que ayer', same: 'igual que ayer' },
    seeBalance: 'Ver saldo en mi billetera',
    failed: (n: number) => (n === 1 ? '1 cobro no pasó · no suma a tus ventas' : `${n} cobros no pasaron · no suman a tus ventas`),
    status: 'Estado',
    filters: { ALL: 'Todas', PAID: 'Recibidas', FAILED: 'No pasaron', OUT: 'Pagos' },
    empty: 'Aún no hay ventas en este periodo.',
  },
  {
    wallet: 'Wallet',
    range: 'Period',
    ranges: { today: 'Today', week: 'Week', month: 'Month' },
    received: { today: 'Received today', week: 'Received this week', month: 'Received this month' },
    inSales: (n: number) => (n === 1 ? 'in 1 sale' : `in ${n} sales`),
    vsYesterday: { more: 'more than yesterday', less: 'less than yesterday', same: 'same as yesterday' },
    seeBalance: 'See balance in my wallet',
    failed: (n: number) => (n === 1 ? "1 charge didn't go through · not counted" : `${n} charges didn't go through · not counted`),
    status: 'Status',
    filters: { ALL: 'All', PAID: 'Received', FAILED: "Didn't go through", OUT: 'Payments' },
    empty: 'No sales in this period yet.',
  },
);

// OUT: the bills the vendor paid itself (recurring payments), money out; the others filter its sales.
type Filter = 'ALL' | 'PAID' | 'FAILED' | 'OUT';
type Shown = { range: SummaryRange; walletId: string | null; filter: Filter };

const RANGES: SummaryRange[] = ['today', 'week', 'month'];
const FILTERS: Filter[] = ['ALL', 'PAID', 'FAILED', 'OUT'];

export default function SalesScreen() {
  return <VendorGate>{(vendor, _replace, reload) => <Sales vendor={vendor} reload={reload} />}</VendorGate>;
}

function Sales({ vendor, reload }: { vendor: VendorView; reload: () => Promise<void> }) {
  const [shown, setShown] = useState<Shown>({ range: 'today', walletId: null, filter: 'ALL' });
  // Keyed by range and wallet, so a switch shows a spinner instead of the previous figures under the new label.
  return <SalesBody key={`${shown.range}:${shown.walletId ?? ''}`} vendor={vendor} shown={shown} setShown={setShown} reload={reload} />;
}

type BodyProps = { vendor: VendorView; shown: Shown; setShown: (shown: Shown) => void; reload: () => Promise<void> };

// Mis ventas (design): what came in over the period, for one receiving wallet at a time so totals never mix assets.
function SalesBody({ vendor, shown, setShown, reload }: BodyProps) {
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const lang = useLang();
  const theme = useTheme();
  const wallets = defaultFirst(vendorWallets(vendor));
  // Starts on the receiving wallet; a wallet removed under Más falls back to it too.
  const wallet = wallets.find((w) => w.id === shown.walletId) ?? wallets[0];
  const summary = useApi<VendorSummary>(`/vendors/${vendor.id}/summary?range=${shown.range}&walletId=${wallet.id}`);
  // Yesterday is the week's second-to-last daily bucket (SDD §9: 7 local days ending today).
  const week = useApi<VendorSummary>(shown.range === 'today' ? `/vendors/${vendor.id}/summary?range=week&walletId=${wallet.id}` : null);
  // shortcut: the newest 200 sales, filtered on the phone by period and status; a month with more shows its latest 200.
  const direction = shown.filter === 'OUT' ? 'out' : 'in';
  const sales = useApi<VendorSaleView[]>(`/vendors/${vendor.id}/sales?limit=200&walletId=${wallet.id}&direction=${direction}`);
  const [selected, setSelected] = useState<VendorSaleView | null>(null);
  const data = summary.data;
  const rows = data
    ? sales.data?.filter((s) => Date.parse(s.createdAt) >= Date.parse(data.from) && (shown.filter === 'ALL' || shown.filter === 'OUT' || s.status === shown.filter))
    : undefined;
  const buckets = week.data?.buckets;
  const yesterday = buckets && buckets.length > 1 ? buckets[buckets.length - 2].total : undefined;
  const vs = data && yesterday !== undefined ? compare(data.paid.total, yesterday) : null;

  return (
    <Screen onRefresh={() => Promise.all([reload(), summary.reload(), week.reload(), sales.reload()])}>
      {wallets.length > 1 && (
        <FilterChips
          label={t.wallet}
          options={wallets.map((w) => ({ value: w.id, label: walletName(w, v.walletNamed) }))}
          value={wallet.id}
          onChange={(walletId) => setShown({ ...shown, walletId })}
        />
      )}
      <FilterChips
        segmented
        label={t.range}
        options={RANGES.map((value) => ({ value, label: t.ranges[value] }))}
        value={shown.range}
        onChange={(range) => setShown({ ...shown, range })}
      />
      {!data ? (
        summary.error ? (
          <ErrorState error={summary.error} onRetry={summary.reload} />
        ) : (
          <LoadingState />
        )
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{t.received[shown.range]}</Text>
            <Text style={styles.heroAmount}>{formatMoney(data.paid.total, data.assetScale, data.assetCode, lang)}</Text>
            <Text style={styles.heroMeta}>{[t.inSales(data.paid.count), vs && t.vsYesterday[vs]].filter(Boolean).join(' · ')}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(walletSite(wallet.walletAddress))}
              style={({ pressed }) => [styles.heroLink, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={styles.heroLinkText}>{t.seeBalance}</Text>
              <MaterialCommunityIcons name="open-in-new" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
          {data.failed.count > 0 && (
            <View style={[styles.banner, { backgroundColor: theme.accentTint }]}>
              <MaterialCommunityIcons name="alert-outline" size={18} color={theme.accentInk} />
              <Text style={[styles.bannerText, { color: theme.accentInk }]}>{t.failed(data.failed.count)}</Text>
            </View>
          )}
          <FilterChips
            label={t.status}
            options={FILTERS.map((value) => ({ value, label: t.filters[value] }))}
            value={shown.filter}
            onChange={(filter) => setShown({ ...shown, filter })}
          />
          {rows ? (
            <View>
              {rows.length === 0 && <ThemedText type="caption">{t.empty}</ThemedText>}
              {rows.map((sale) => (
                <SaleRow key={sale.id} sale={sale} onPress={() => setSelected(sale)} />
              ))}
            </View>
          ) : sales.error ? (
            <ErrorState error={sales.error} onRetry={sales.reload} />
          ) : (
            <LoadingState />
          )}
        </>
      )}
      <SaleSheet sale={selected} wallets={wallets} onClose={() => setSelected(null)} />
    </Screen>
  );
}

// Digit strings in the same asset compare as BigInt, never as floats.
function compare(today: string, yesterday: string): 'more' | 'less' | 'same' {
  const [a, b] = [BigInt(today), BigInt(yesterday)];
  return a > b ? 'more' : a < b ? 'less' : 'same';
}

const styles = StyleSheet.create({
  // Brand teal under white text (4.9:1) in both schemes; the figure is the one thing this screen leads with.
  hero: { backgroundColor: Brand.teal, borderRadius: 20, padding: 20, gap: 6 },
  heroLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  heroAmount: { color: '#FFFFFF', fontSize: 40, lineHeight: 46, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroMeta: { color: '#FFFFFF', fontSize: 14 },
  heroLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroLinkText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
