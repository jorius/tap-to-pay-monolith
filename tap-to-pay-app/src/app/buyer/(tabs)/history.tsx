import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { buyerAmount, formatMoney } from '@/api/money';
import type { BuyerSales, SaleView } from '@/api/types';
import { Initials } from '@/components/buyer/initials';
import { LoadState } from '@/components/buyer/load-state';
import { useRefusalText } from '@/components/buyer/refusal';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FilterChips } from '@/components/vendor/chips';
import { useApi } from '@/hooks/use-api';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    period: 'Periodo',
    today: 'Hoy',
    week: 'Últimos 7 días',
    spent: { today: 'Gastaste hoy', week: 'Gastaste en 7 días' },
    left: 'Te quedan',
    wallet: 'Billetera',
    empty: 'Sin movimientos en este periodo.',
    refused: (reason: string) => `No se pagó · ${reason}`,
    charging: 'En curso',
  },
  {
    period: 'Period',
    today: 'Today',
    week: 'Last 7 days',
    spent: { today: 'Spent today', week: 'Spent in 7 days' },
    left: 'You have left',
    wallet: 'Wallet',
    empty: 'No activity in this period.',
    refused: (reason: string) => `Not paid · ${reason}`,
    charging: 'In progress',
  },
);

type Period = 'today' | 'week';

// The buyer's movements (design: Movimientos), re-read every 3 s while focused (SDD §6). The period filter runs on
// the phone over the sales the service lists.
export default function HistoryScreen() {
  const { buyerId } = useSession();
  const { wallets, defaultWallet, reload: reloadCards } = useBuyerCards();
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const [period, setPeriod] = useState<Period>('today');
  const [picked, setPicked] = useState<string | null>(null);
  // A picked wallet that was since removed falls back to the default one.
  const wallet = wallets.find((w) => w.id === picked) ?? defaultWallet;
  // shortcut: the service lists at most 100 sales, so a very busy week may be cut short; page the list to go further.
  const query = `?limit=100${wallet ? `&walletId=${encodeURIComponent(wallet.id)}` : ''}`;
  const { data, error, loading, reload } = useApi<BuyerSales>(buyerId ? `/buyers/${buyerId}/sales${query}` : null, {
    pollMs: 3000,
  });

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (period === 'week') since.setDate(since.getDate() - 6);
  const sales = data?.sales.filter((sale) => new Date(sale.createdAt) >= since) ?? [];
  // A paid sale is debited in the paying wallet's asset, so the minor units add up.
  const spent = sales
    .filter((sale) => sale.status === 'PAID')
    .reduce((sum, sale) => sum + BigInt(sale.debitAmount ?? sale.amount), BigInt(0));
  const money = (amount: string) => (wallet ? formatMoney(amount, wallet.assetScale, wallet.assetCode, lang) : '—');

  return (
    <Screen onRefresh={() => Promise.all([reload(), reloadCards()])}>
      <FilterChips
        label={t.period}
        options={[
          { value: 'today', label: t.today },
          { value: 'week', label: t.week },
        ]}
        value={period}
        onChange={setPeriod}
      />

      <ThemedView card style={styles.summary}>
        <View>
          <ThemedText type="caption">{t.spent[period]}</ThemedText>
          <Text style={[styles.big, { color: theme.text }]}>{data ? money(spent.toString()) : '—'}</Text>
        </View>
        <View style={styles.right}>
          <ThemedText type="caption">{t.left}</ThemedText>
          <Text style={[styles.big, { color: theme.primaryInk }]}>{data ? money(data.remainingToday) : '—'}</Text>
        </View>
      </ThemedView>

      {wallets.length > 1 && (
        <FilterChips
          label={t.wallet}
          options={wallets.map((w) => ({ value: w.id, label: w.publicName ?? w.assetCode }))}
          value={wallet?.id ?? ''}
          onChange={setPicked}
        />
      )}

      <LoadState loading={loading} error={error} hasData={data !== undefined} onRetry={reload} />
      {data && sales.length === 0 && <ThemedText type="caption">{t.empty}</ThemedText>}
      {sales.map((sale) => (
        <SaleLine key={sale.id} sale={sale} />
      ))}
    </Screen>
  );
}

// A compact row: who, when, and the amount on the right. Paid money leaves the wallet, so it is "−" in red; a refused
// charge is struck through in grey and says why under the row; one in progress says so. No "Pagado" label.
function SaleLine({ sale }: { sale: SaleView }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const refusal = useRefusalText();
  const paid = sale.status === 'PAID';
  const refused = sale.status === 'FAILED';
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.main}>
        <Initials name={sale.vendorName ?? '?'} size={40} background={theme.accentTint} color={theme.accentInk} />
        <View style={styles.info}>
          <ThemedText numberOfLines={1} style={styles.vendor}>
            {sale.vendorName ?? '—'}
          </ThemedText>
          <ThemedText type="caption">{when(sale.createdAt, lang)}</ThemedText>
        </View>
        <View style={styles.amountBox}>
          <Text
            style={[
              styles.amount,
              paid
                ? { color: theme.outflow }
                : refused
                  ? { color: theme.refused, textDecorationLine: 'line-through' }
                  : { color: theme.text },
            ]}>
            {paid ? '−' : ''}
            {buyerAmount(sale, lang)}
          </Text>
          {sale.status === 'CHARGING' && <Text style={[styles.note, { color: theme.accentInk }]}>{t.charging}</Text>}
        </View>
      </View>
      {refused && (
        <Text style={[styles.note, styles.reason, { color: theme.refused }]} numberOfLines={2}>
          {t.refused(refusal(sale))}
        </Text>
      )}
    </View>
  );
}

// "7:24 p. m." today, "16 oct · 7:24 p. m." before that, in the phone's time zone.
function when(iso: string, lang: Lang) {
  const date = new Date(iso);
  const locale = lang === 'es' ? 'es-CO' : 'en-US';
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${time}`;
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 14 },
  right: { alignItems: 'flex-end' },
  big: { fontSize: 24, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { borderBottomWidth: 1, paddingVertical: 10, gap: 4 },
  main: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, gap: 2 },
  vendor: { fontSize: 16, fontWeight: '600' },
  amountBox: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  reason: { marginLeft: 52 },
});
