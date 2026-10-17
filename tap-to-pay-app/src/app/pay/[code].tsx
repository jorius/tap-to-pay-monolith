import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { buyerAmount, formatMoney } from '@/api/money';
import type { BuyerView, PaymentRequestView, SaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { useRefusalText } from '@/components/buyer/refusal';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fill, time } from '@/components/vendor/format';
import { Brand, Fills, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    to: 'Pagas a',
    concept: 'Concepto',
    expires: 'Vence a las {time}',
    otherAsset: 'Tu billetera paga en su moneda; el monto final sale de la cotización.',
    payWith: 'Pagar con',
    noGrant: 'sin autorizar',
    pay: (amount: string) => `Pagar ${amount}`,
    paying: 'Procesando el pago…',
    paid: 'Pago aprobado',
    refused: 'Pago rechazado',
    unconfirmed: 'No pudimos confirmar el pago. Revisa tu billetera antes de intentarlo de nuevo.',
    alreadyPaid: 'Este cobro ya fue pagado.',
    expired: 'Este link venció. Pide al vendedor uno nuevo.',
    unavailable: 'Este cobro ya no se puede pagar.',
    noBuyer: 'Primero elige quién usa este teléfono.',
    pickBuyer: 'Elegir comprador',
    noWallet: 'Ninguna de tus billeteras autoriza pagos todavía (npm run grant:buyer).',
    done: 'Listo',
  },
  {
    to: 'You pay',
    concept: 'For',
    expires: 'Expires at {time}',
    otherAsset: 'Your wallet pays in its own currency; the final amount comes from the quote.',
    payWith: 'Pay with',
    noGrant: 'not authorized',
    pay: (amount: string) => `Pay ${amount}`,
    paying: 'Processing the payment…',
    paid: 'Payment approved',
    refused: 'Payment refused',
    unconfirmed: "Couldn't confirm the payment. Check your wallet before trying again.",
    alreadyPaid: 'This payment has already been made.',
    expired: 'This link has expired. Ask the vendor for a new one.',
    unavailable: 'This payment can no longer be made.',
    noBuyer: 'First pick who uses this phone.',
    pickBuyer: 'Pick a buyer',
    noWallet: 'None of your wallets authorizes payments yet (npm run grant:buyer).',
    done: 'Done',
  },
);

const CHARGE_TIMEOUT_MS = 30_000;
const POLL_MS = 1000;
const MAX_POLLS = 30;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { state: 'paying' } | { state: 'done'; sale: SaleView } | { state: 'unconfirmed' };

// The payment screen of a link (SDD §10, "Payment links and QR"): opened by scanning the vendor's QR, pasting the link,
// or the app link <scheme>://pay/<code> from the WhatsApp page. The charge has the same rules as a tap.
export default function PayScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { buyerId } = useSession();
  const router = useRouter();
  const t = useCopy(copy);
  if (!buyerId) {
    return (
      <Screen>
        <ThemedText>{t.noBuyer}</ThemedText>
        <BigButton label={t.pickBuyer} color={Fills.primary} onPress={() => router.replace('/buyer')} />
      </Screen>
    );
  }
  return <Pay code={code} buyerId={buyerId} />;
}

function Pay({ code, buyerId }: { code: string; buyerId: string }) {
  const theme = useTheme();
  const lang = useLang();
  const router = useRouter();
  const t = useCopy(copy);
  const refusal = useRefusalText();
  const colors = roleColors(theme, 'buyer');
  const request = useApi<PaymentRequestView>(`/pay/${code}`);
  const buyer = useApi<BuyerView>(`/buyers/${buyerId}`);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const req = request.data;
  const wallets = buyer.data?.wallets ?? [];
  const authorized = wallets.filter((w) => w.hasGrant);
  // The default wallet pays unless the buyer picks another authorized one.
  const wallet =
    authorized.find((w) => w.id === walletId) ??
    authorized.find((w) => w.id === buyer.data?.defaultWalletId) ??
    authorized[0];
  const amount = req ? formatMoney(req.amount, req.assetScale, req.assetCode, lang) : '';

  const pay = async () => {
    if (!req || !wallet || outcome) return;
    setError(null);
    setOutcome({ state: 'paying' });
    let sale: SaleView;
    try {
      sale = await api<SaleView>(`/pay/${code}/charge`, {
        method: 'POST',
        body: { walletAddress: wallet.walletAddress },
        timeoutMs: CHARGE_TIMEOUT_MS,
      });
    } catch (e) {
      const failure = e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e), 0);
      // The charge may have run and only its answer was lost: re-read before letting the buyer try again.
      const fresh = await api<PaymentRequestView>(`/pay/${code}`).catch(() => null);
      if (!alive.current) return;
      if (fresh && fresh.status === 'AWAITING_TAP') {
        setOutcome(null);
        setError(failure);
        request.set(fresh);
      } else if (fresh) {
        request.set(fresh);
        setOutcome(fresh.status === 'CHARGING' ? { state: 'unconfirmed' } : null);
      } else {
        setOutcome({ state: 'unconfirmed' });
      }
      return;
    }
    // CHARGING: follow the sale, as the terminal does, for up to 30 s.
    for (let i = 0; sale.status === 'CHARGING' && i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      if (!alive.current) return;
      sale = await api<SaleView>(`/sales/${sale.id}`).catch(() => sale);
    }
    if (!alive.current) return;
    setOutcome(sale.status === 'CHARGING' ? { state: 'unconfirmed' } : { state: 'done', sale });
  };

  if (outcome?.state === 'paying') {
    return (
      <Screen>
        <ActivityIndicator size="large" color={Brand.teal} style={styles.spinner} />
        <Text style={[styles.title, { color: theme.text }]}>{t.paying}</Text>
        <Text style={[styles.amount, { color: theme.text }]}>{amount}</Text>
      </Screen>
    );
  }

  if (outcome) {
    const sale = outcome.state === 'done' ? outcome.sale : null;
    const paid = sale?.status === 'PAID';
    const color = paid ? theme.income : sale ? theme.outflow : theme.text;
    return (
      <Screen>
        <View style={styles.center}>
          <MaterialCommunityIcons
            name={paid ? 'check-circle-outline' : sale ? 'close-circle-outline' : 'help-circle-outline'}
            size={104}
            color={color}
          />
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.title, { color }]}>
          {paid ? t.paid : sale ? t.refused : t.unconfirmed}
        </Text>
        {sale && <Text style={[styles.amount, { color: theme.text }]}>{buyerAmount(sale, lang)}</Text>}
        {req && <ThemedText style={styles.centerText}>{req.vendorName}</ThemedText>}
        {sale?.status === 'FAILED' && <ThemedText style={styles.centerText}>{refusal(sale)}</ThemedText>}
        <BigButton label={t.done} color={Fills.primary} onPress={() => router.replace('/buyer/card')} />
      </Screen>
    );
  }

  const closed = req && (req.status !== 'AWAITING_TAP' || req.expired);
  return (
    <Screen onRefresh={request.reload}>
      <LoadState loading={request.loading} error={request.error} hasData={req !== undefined} onRetry={request.reload} />
      {req && (
        <>
          <ThemedView card style={styles.center}>
            <ThemedText type="caption">{t.to}</ThemedText>
            <ThemedText type="subtitle">{req.vendorName}</ThemedText>
            <Text style={[styles.amount, { color: theme.text }]}>{amount}</Text>
            {req.description ? (
              <ThemedText style={styles.centerText}>
                {t.concept}: {req.description}
              </ThemedText>
            ) : null}
            {!closed && <ThemedText type="caption">{fill(t.expires, { time: time(req.expiresAt, lang) })}</ThemedText>}
          </ThemedView>

          {closed ? (
            <StatusPill
              tone={req.status === 'PAID' ? 'ok' : 'bad'}
              label={req.status === 'PAID' ? t.alreadyPaid : req.expired ? t.expired : t.unavailable}
            />
          ) : (
            <>
              <LoadState loading={buyer.loading} error={buyer.error} hasData={buyer.data !== undefined} onRetry={buyer.reload} />
              {buyer.data && !wallet && <StatusPill tone="bad" label={t.noWallet} />}
              {wallets.length > 1 && (
                <View style={styles.wallets}>
                  <ThemedText type="caption">{t.payWith}</ThemedText>
                  {wallets.map((w) => {
                    const selected = w.id === wallet?.id;
                    return (
                      <Pressable
                        key={w.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: !w.hasGrant }}
                        disabled={!w.hasGrant}
                        onPress={() => setWalletId(w.id)}
                        style={({ pressed }) => [
                          styles.wallet,
                          {
                            borderColor: selected ? colors.ink : theme.border,
                            backgroundColor: theme.surface,
                            opacity: !w.hasGrant ? 0.4 : pressed ? 0.7 : 1,
                          },
                        ]}>
                        <Text style={[styles.walletName, { color: theme.text }]}>
                          {w.publicName ?? w.assetCode} · {w.assetCode}
                        </Text>
                        {!w.hasGrant && <ThemedText type="caption">{t.noGrant}</ThemedText>}
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {wallet && wallet.assetCode !== req.assetCode && <ThemedText type="caption">{t.otherAsset}</ThemedText>}
              {error && <StatusPill tone="bad" label={error.message} />}
              <BigButton label={t.pay(amount)} color={Fills.primary} disabled={!wallet} onPress={pay} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 4 },
  centerText: { textAlign: 'center' },
  spinner: { marginVertical: 24, transform: [{ scale: 1.6 }] },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  amount: { fontSize: 36, lineHeight: 44, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  wallets: { gap: 8 },
  wallet: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 2 },
  walletName: { fontSize: 16, fontWeight: '700' },
});
