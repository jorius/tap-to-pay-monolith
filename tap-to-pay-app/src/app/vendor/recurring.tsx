import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { buyerAmount, formatMoney } from '@/api/money';
import type { BillerView, RecurringView, SaleView, VendorPayerView, VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { useRefusalText } from '@/components/buyer/refusal';
import { AddRecurringSheet } from '@/components/recurring/add-recurring-sheet';
import { BillerBadge } from '@/components/recurring/biller-badge';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { locale } from '@/components/vendor/format';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { Fills, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Pagos de servicios',
    intro:
      'Inscribe los servicios de tu negocio y se pagan solos cada mes desde tu billetera. Cada pago a tiempo suma a tu historial de pagos, el que muestra el resumen PDF para pedir un crédito.',
    authorizeTitle: 'Autoriza tu billetera para pagar',
    authorizeBody:
      'Open Payments pide tu permiso una sola vez para que el servicio pague desde tu billetera. Corre esto en tap-to-pay-svc y acepta en el navegador:',
    add: 'Añadir pago',
    empty: 'Aún no tienes servicios inscritos. Toca Añadir pago y elige EPM, Claro, Tigo u otro servicio.',
    every: (day: number) => `Cada mes, el día ${day}`,
    next: (date: string) => `Próximo pago: ${date}`,
    paused: 'En pausa',
    last: { PAID: 'Último pago a tiempo', FAILED: 'Último pago no se hizo', CHARGING: 'Último pago en proceso', AWAITING_TAP: '' } as Record<string, string>,
    payNow: 'Pagar ahora',
    paying: 'Pagando…',
    pause: 'Pausar',
    resume: 'Reanudar',
    remove: 'Eliminar',
    removeTitle: (name: string) => `¿Eliminar el pago a ${name}?`,
    removeBody: 'Dejará de pagarse. Los pagos ya hechos siguen en tu historial.',
    cancel: 'Cancelar',
    paidNow: (amount: string) => `Pagado: ${amount}`,
  },
  {
    title: 'Bill payments',
    intro:
      "Enrol your business's services and they pay themselves every month from your wallet. Every payment on time adds to your payment history, the one the PDF statement shows a lender.",
    authorizeTitle: 'Authorize your wallet to pay',
    authorizeBody:
      'Open Payments asks for your permission once so the service can pay from your wallet. Run this in tap-to-pay-svc and accept in the browser:',
    add: 'Add payment',
    empty: 'No services enrolled yet. Tap Add payment and pick EPM, Claro, Tigo or another service.',
    every: (day: number) => `Every month, on day ${day}`,
    next: (date: string) => `Next payment: ${date}`,
    paused: 'Paused',
    last: { PAID: 'Last payment on time', FAILED: 'Last payment not made', CHARGING: 'Last payment in progress', AWAITING_TAP: '' } as Record<string, string>,
    payNow: 'Pay now',
    paying: 'Paying…',
    pause: 'Pause',
    resume: 'Resume',
    remove: 'Remove',
    removeTitle: (name: string) => `Remove the payment to ${name}?`,
    removeBody: 'It will no longer be paid. Payments already made stay in your history.',
    cancel: 'Cancel',
    paidNow: (amount: string) => `Paid: ${amount}`,
  },
);

export default function RecurringScreen() {
  return <VendorGate>{(vendor) => <Recurring vendor={vendor} />}</VendorGate>;
}

// The vendor's monthly payments to services (SDD §10, "Recurring payments"): paid from the vendor's own wallets, which
// need a grant once; the list, pay now, pause and remove, and the sheet to enrol in a new one.
function Recurring({ vendor }: { vendor: VendorView }) {
  const t = useCopy(copy);
  const theme = useTheme();
  const base = `/vendors/${vendor.id}`;
  const list = useApi<RecurringView[]>(`${base}/recurring`);
  const billers = useApi<BillerView[]>('/billers');
  const payer = useApi<VendorPayerView>(`${base}/payer`);
  const [adding, setAdding] = useState(false);
  const items = list.data ?? [];
  const byId = new Map((billers.data ?? []).map((b) => [b.id, b]));
  const unauthorized = (payer.data?.wallets ?? []).filter((w) => !w.hasGrant);
  const replace = (row: RecurringView) => list.set(items.map((r) => (r.id === row.id ? row : r)));

  if (list.error && !list.data) return <Screen onRefresh={list.reload}><ErrorState error={list.error} onRetry={list.reload} /></Screen>;
  return (
    <Screen onRefresh={() => Promise.all([list.reload(), billers.reload(), payer.reload()])}>
      <ThemedText type="title">{t.title}</ThemedText>
      <ThemedText type="caption">{t.intro}</ThemedText>

      {unauthorized.length > 0 && (
        <ThemedView card style={{ borderColor: Fills.pending, borderWidth: 2 }}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="shield-key-outline" size={26} color={Fills.pending} />
            <ThemedText type="subtitle" style={styles.flex}>
              {t.authorizeTitle}
            </ThemedText>
          </View>
          <ThemedText type="caption">{t.authorizeBody}</ThemedText>
          {unauthorized.map((w) => (
            <Text key={w.id} selectable style={[styles.command, { color: theme.text, backgroundColor: theme.background }]}>
              {w.grantCommand}
            </Text>
          ))}
        </ThemedView>
      )}

      <BigButton label={t.add} color={Fills.primary} disabled={!billers.data || !payer.data} onPress={() => setAdding(true)} />
      {list.loading && !list.data && <LoadingState />}
      {list.data && items.length === 0 && <ThemedText>{t.empty}</ThemedText>}
      {items.map((row) => (
        <RecurringCard
          key={row.id}
          row={row}
          biller={row.billerId ? byId.get(row.billerId) : undefined}
          path={`${base}/recurring/${row.id}`}
          onChange={replace}
          onRemoved={() => list.set(items.filter((r) => r.id !== row.id))}
          onPaid={() => list.reload()}
        />
      ))}
      <AddRecurringSheet
        visible={adding}
        ownerPath={base}
        billers={billers.data ?? []}
        wallets={payer.data?.wallets ?? []}
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
  path: string;
  onChange: (row: RecurringView) => void;
  onRemoved: () => void;
  onPaid: () => void;
};

function RecurringCard({ row, biller, path, onChange, onRemoved, onPaid }: CardProps) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const refusal = useRefusalText();
  const colors = roleColors(theme, 'vendor');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
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
      setResult(
        sale.status === 'PAID'
          ? { tone: 'ok', text: t.paidNow(buyerAmount(sale, lang)) }
          : { tone: 'bad', text: refusal(sale) || sale.status },
      );
      onPaid();
    });
  const toggle = () => run(async () => onChange(await api<RecurringView>(path, { method: 'PATCH', body: { active: !row.active } })));
  const remove = () =>
    Alert.alert(t.removeTitle(row.payeeName), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.remove,
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await api(path, { method: 'DELETE' });
            onRemoved();
          }),
      },
    ]);

  return (
    <ThemedView card style={!row.active && styles.paused}>
      <View style={styles.row}>
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
      <BigButton label={busy ? t.paying : t.payNow} color={Fills.primary} disabled={busy} onPress={payNow} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <BigButton label={row.active ? t.pause : t.resume} color={colors.ink} ghost disabled={busy} onPress={toggle} />
        </View>
        <View style={styles.flex}>
          <BigButton label={t.remove} color={theme.outflow} ghost disabled={busy} onPress={remove} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  name: { fontSize: 18, fontWeight: '800' },
  amount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  command: { fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 8 },
  paused: { opacity: 0.7 },
});
