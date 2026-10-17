import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { buyerAmount, formatMoney } from '@/api/money';
import type { BillerView, BuyerView, RecurringView, SaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { AddRecurringSheet } from '@/components/buyer/add-recurring-sheet';
import { BillerBadge } from '@/components/buyer/biller-badge';
import { LoadState } from '@/components/buyer/load-state';
import { useRefusalText } from '@/components/buyer/refusal';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { locale } from '@/components/vendor/format';
import { Fill, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Pagos recurrentes',
    intro: 'Inscribe tus servicios y se pagan solos cada mes desde tu billetera, dentro de tus topes.',
    add: 'Añadir pago',
    empty: 'Aún no tienes pagos inscritos. Toca Añadir pago y elige EPM, Claro, Tigo u otro servicio.',
    every: (day: number) => `Cada mes, el día ${day}`,
    next: (date: string) => `Próximo cobro: ${date}`,
    paused: 'En pausa',
    last: { PAID: 'Último pago aprobado', FAILED: 'Último pago rechazado', CHARGING: 'Último pago en proceso', AWAITING_TAP: '' } as Record<string, string>,
    payNow: 'Pagar ahora',
    paying: 'Pagando…',
    pause: 'Pausar',
    resume: 'Reanudar',
    remove: 'Eliminar',
    removeTitle: (name: string) => `¿Eliminar el pago a ${name}?`,
    removeBody: 'Dejará de cobrarse. Los pagos ya hechos siguen en tu historial.',
    cancel: 'Cancelar',
    paidNow: (amount: string) => `Pagado: ${amount}`,
  },
  {
    title: 'Recurring payments',
    intro: 'Enrol your services and they pay themselves every month from your wallet, within your limits.',
    add: 'Add payment',
    empty: 'No payments enrolled yet. Tap Add payment and pick EPM, Claro, Tigo or another service.',
    every: (day: number) => `Every month, on day ${day}`,
    next: (date: string) => `Next charge: ${date}`,
    paused: 'Paused',
    last: { PAID: 'Last payment approved', FAILED: 'Last payment refused', CHARGING: 'Last payment in progress', AWAITING_TAP: '' } as Record<string, string>,
    payNow: 'Pay now',
    paying: 'Paying…',
    pause: 'Pause',
    resume: 'Resume',
    remove: 'Remove',
    removeTitle: (name: string) => `Remove the payment to ${name}?`,
    removeBody: 'It will no longer be charged. Payments already made stay in your history.',
    cancel: 'Cancel',
    paidNow: (amount: string) => `Paid: ${amount}`,
  },
);

// The buyer's monthly payments to services (SDD §10, "Recurring payments"): the list, pay now, pause and remove, and
// the sheet to enrol in a new one.
export default function RecurringScreen() {
  const { buyerId } = useSession();
  const t = useCopy(copy);
  const list = useApi<RecurringView[]>(buyerId ? `/buyers/${buyerId}/recurring` : null);
  const billers = useApi<BillerView[]>('/billers');
  const buyer = useApi<BuyerView>(buyerId ? `/buyers/${buyerId}` : null);
  const [adding, setAdding] = useState(false);
  if (!buyerId) return null;
  const items = list.data ?? [];
  const byId = new Map((billers.data ?? []).map((b) => [b.id, b]));

  const replace = (row: RecurringView) => list.set(items.map((r) => (r.id === row.id ? row : r)));

  return (
    <Screen onRefresh={() => Promise.all([list.reload(), billers.reload(), buyer.reload()])}>
      <ThemedText type="title">{t.title}</ThemedText>
      <ThemedText type="caption">{t.intro}</ThemedText>
      <BigButton label={t.add} color={Fill.buyer} disabled={!billers.data || !buyer.data} onPress={() => setAdding(true)} />
      <LoadState loading={list.loading} error={list.error} hasData={list.data !== undefined} onRetry={list.reload} />
      {list.data && items.length === 0 && <ThemedText>{t.empty}</ThemedText>}
      {items.map((row) => (
        <RecurringCard
          key={row.id}
          row={row}
          biller={row.billerId ? byId.get(row.billerId) : undefined}
          buyerId={buyerId}
          onChange={replace}
          onRemoved={() => list.set(items.filter((r) => r.id !== row.id))}
          onPaid={() => list.reload()}
        />
      ))}
      <AddRecurringSheet
        visible={adding}
        buyerId={buyerId}
        billers={billers.data ?? []}
        wallets={buyer.data?.wallets ?? []}
        onClose={() => setAdding(false)}
        onAdded={(row) => {
          setAdding(false);
          list.set([...items, row]);
        }}
      />
    </Screen>
  );
}

type CardProps = {
  row: RecurringView;
  biller?: BillerView;
  buyerId: string;
  onChange: (row: RecurringView) => void;
  onRemoved: () => void;
  onPaid: () => void;
};

function RecurringCard({ row, biller, buyerId, onChange, onRemoved, onPaid }: CardProps) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const refusal = useRefusalText();
  const colors = roleColors(theme, 'buyer');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const path = `/buyers/${buyerId}/recurring/${row.id}`;
  const when = new Date(row.nextRunAt).toLocaleString(locale(lang), { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    try {
      await work();
    } catch (e) {
      setResult({ tone: 'bad', text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const payNow = () =>
    run(async () => {
      const sale = await api<SaleView>(`${path}/pay`, { method: 'POST', timeoutMs: 30_000 });
      setResult(sale.status === 'PAID' ? { tone: 'ok', text: t.paidNow(buyerAmount(sale, lang)) } : { tone: 'bad', text: refusal(sale) || sale.status });
      onPaid();
    });
  const toggle = () => run(async () => onChange(await api<RecurringView>(path, { method: 'PATCH', body: { active: !row.active } })));
  const remove = () =>
    Alert.alert(t.removeTitle(row.payeeName), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: () => run(async () => {
        await api(path, { method: 'DELETE' });
        onRemoved();
      }) },
    ]);

  return (
    <ThemedView card style={!row.active && styles.paused}>
      <View style={styles.head}>
        <BillerBadge biller={biller} name={row.payeeName} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.text }]}>{row.payeeName}</Text>
          {row.reference ? <ThemedText type="caption">{row.reference}</ThemedText> : null}
        </View>
        <Text style={[styles.amount, { color: theme.text }]}>{formatMoney(row.amount, row.assetScale, row.assetCode, lang)}</Text>
      </View>
      <ThemedText type="caption">
        {t.every(row.dayOfMonth)} · {row.active ? t.next(when) : t.paused}
      </ThemedText>
      {row.lastStatus && t.last[row.lastStatus] ? (
        <StatusPill tone={row.lastStatus === 'PAID' ? 'ok' : row.lastStatus === 'FAILED' ? 'bad' : 'wait'} label={t.last[row.lastStatus]} />
      ) : null}
      {result && <StatusPill tone={result.tone} label={result.text} />}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <BigButton label={busy ? t.paying : t.payNow} color={Fill.buyer} disabled={busy} onPress={payNow} />
        </View>
      </View>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <BigButton label={row.active ? t.pause : t.resume} color={colors.ink} ghost disabled={busy} onPress={toggle} />
        </View>
        <View style={styles.flex}>
          <BigButton label={t.remove} color={theme.badInk} ghost disabled={busy} onPress={remove} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  name: { fontSize: 18, fontWeight: '800' },
  amount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  paused: { opacity: 0.7 },
});
