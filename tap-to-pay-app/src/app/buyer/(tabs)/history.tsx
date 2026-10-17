import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { buyerAmount, formatMoney } from '@/api/money';
import type { BuyerSales, SaleView } from '@/api/types';
import { Initials } from '@/components/buyer/initials';
import { LoadState } from '@/components/buyer/load-state';
import { useRefusalText } from '@/components/buyer/refusal';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { STATUS_TONE } from '@/components/vendor/format';
import { Brand } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    card: 'Billetera',
    leftToday: 'Disponible hoy',
    period: 'Periodo',
    today: 'Hoy',
    week: 'Semana',
    empty: 'Sin cobros en este periodo.',
    which: 'Aparecen los cobros a tus billeteras: pagados, en curso y rechazados por tus topes o tu autorización.',
    live: 'Se actualiza cada 3 s mientras esta pantalla está abierta.',
    status: { PAID: 'PAGADO', CHARGING: 'COBRANDO', FAILED: 'RECHAZADO' } as Record<string, string>,
  },
  {
    card: 'Wallet',
    leftToday: 'Left today',
    period: 'Period',
    today: 'Today',
    week: 'Week',
    empty: 'No charges in this period.',
    which: 'Charges to your wallets appear here: paid, in progress, and refused by your limits or authorization.',
    live: 'Refreshes every 3 s while this screen is open.',
    status: { PAID: 'PAID', CHARGING: 'CHARGING', FAILED: 'REFUSED' } as Record<string, string>,
  },
);

type Period = 'today' | 'week';

// The charges of one of the buyer's wallets (design: BuyerHistory), re-read every 3 s while focused (SDD §6). The
// service returns the last 20; the period filter runs on the phone over those.
export default function HistoryScreen() {
  const { buyerId } = useSession();
  const { wallets, defaultWallet, reload: reloadCards } = useBuyerCards();
  const refusal = useRefusalText();
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const [period, setPeriod] = useState<Period>('today');
  const [picked, setPicked] = useState<string | null>(null);
  // A picked wallet that was since removed falls back to the default one.
  const wallet = wallets.find((w) => w.id === picked) ?? defaultWallet;
  const query = wallet ? `?walletId=${encodeURIComponent(wallet.id)}` : '';
  const { data, error, loading, reload } = useApi<BuyerSales>(buyerId ? `/buyers/${buyerId}/sales${query}` : null, {
    pollMs: 3000,
  });
  // Which wallet paid: its currency and the path of its address ("USD · /ana").
  const paidWith = (sale: SaleView) => {
    const w = wallets.find((x) => x.id === sale.buyerWalletId);
    return w ? `${w.assetCode} · ${w.walletAddress.replace(/^https?:\/\/[^/]+/, '') || w.walletAddress}` : null;
  };

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (period === 'week') since.setDate(since.getDate() - 6);
  const sales = data?.sales.filter((sale) => new Date(sale.createdAt) >= since) ?? [];

  return (
    <Screen onRefresh={() => Promise.all([reload(), reloadCards()])}>
      {wallets.length > 1 && (
        <Chips
          label={t.card}
          options={wallets.map((w) => ({ key: w.id, text: w.assetCode }))}
          selected={wallet?.id ?? null}
          onSelect={setPicked}
        />
      )}

      <View style={[styles.left, { backgroundColor: theme.card }]}>
        <ThemedText type="caption" style={styles.leftLabel}>
          {t.leftToday}
        </ThemedText>
        <Text style={[styles.leftAmount, { color: theme.text }]}>
          {data && wallet ? formatMoney(data.remainingToday, wallet.assetScale, wallet.assetCode, lang) : '—'}
        </Text>
      </View>

      <Chips
        label={t.period}
        options={[
          { key: 'today', text: t.today },
          { key: 'week', text: t.week },
        ]}
        selected={period}
        onSelect={(key) => setPeriod(key as Period)}
      />

      <LoadState loading={loading} error={error} hasData={data !== undefined} onRetry={reload} />
      {data && sales.length === 0 && <ThemedText type="caption">{t.empty}</ThemedText>}
      {sales.map((sale) => (
        <View key={sale.id} style={[styles.row, { borderBottomColor: theme.border }]}>
          <Initials name={sale.vendorName ?? '?'} size={40} background={theme.vendorTint} color={theme.vendorInk} />
          <View style={styles.info}>
            <ThemedText style={styles.vendor}>{sale.vendorName ?? '—'}</ThemedText>
            <ThemedText type="caption">
              {[when(sale.createdAt, lang, t.today), paidWith(sale)].filter(Boolean).join(' · ')}
            </ThemedText>
            {sale.status === 'FAILED' && (
              <ThemedText type="caption" style={{ color: theme.badInk }}>
                {refusal(sale)}
              </ThemedText>
            )}
          </View>
          <View style={styles.amountBox}>
            {/* A refused charge moved no money, so it carries no minus. */}
            <Text style={[styles.amount, { color: theme.text }]}>
              {sale.status === 'FAILED' ? '' : '−'}
              {buyerAmount(sale, lang)}
            </Text>
            <StatusPill tone={STATUS_TONE[sale.status]} label={t.status[sale.status] ?? sale.status} />
          </View>
        </View>
      ))}

      <ThemedText type="caption">{t.which}</ThemedText>
      <View style={styles.live}>
        <View style={styles.liveDot} />
        <ThemedText type="caption">{t.live}</ThemedText>
      </View>
    </Screen>
  );
}

type ChipsProps = { label: string; options: { key: string; text: string }[]; selected: string | null; onSelect: (key: string) => void };

function Chips({ label, options, selected, onSelect }: ChipsProps) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map(({ key, text }) => {
        const on = key === selected;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onSelect(key)}
            style={[
              styles.chip,
              on ? { backgroundColor: theme.text, borderColor: theme.text } : { backgroundColor: 'transparent', borderColor: theme.border },
            ]}>
            <Text style={[styles.chipText, { color: on ? theme.background : theme.text }]}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 2, borderRadius: 999, paddingHorizontal: 16 },
  chipText: { fontSize: 14, fontWeight: '700' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 8 },
  info: { flex: 1, gap: 2 },
  vendor: { fontSize: 16, fontWeight: '700' },
  amountBox: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 16, fontWeight: '800' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.buyer },
});
