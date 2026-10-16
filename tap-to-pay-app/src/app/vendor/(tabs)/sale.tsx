import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { errorText, failureText, fill, time } from '@/components/vendor/format';
import { Keypad } from '@/components/vendor/keypad';
import { SimulateTap } from '@/components/vendor/simulate-tap';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { Brand, Fill, roleColors } from '@/constants/theme';
import { useSale, type AppFailure } from '@/hooks/use-sale';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

const copy = defineCopy(
  {
    amount: 'Monto',
    cents: 'Escribe en centavos: 1 2 0 0 → {example}',
    charge: 'Cobrar',
    del: 'Borrar',
    saleOf: 'Venta',
    hold: 'Acerca el teléfono del cliente a la parte de atrás de este',
    readerOn: 'venta {id} · lector activo',
    readerSimulated: 'venta {id} · sin lector NFC',
    cancel: 'Cancelar',
    nfcRetry: 'Inténtalo de nuevo: acerca más los teléfonos',
    readerStays: 'El lector sigue encendido.',
    walletRead: 'Billetera leída',
    charging: 'cobrando…',
    paid: '✓ Pagado',
    paidAt: 'Pagado a las {time}',
    newSale: 'Nueva venta',
    notPaid: '✕ No pagado',
    unconfirmed: '? Sin confirmar',
    unconfirmedMsg: 'No pudimos confirmar el pago. Revisa la billetera.',
    noNfc: 'Este teléfono no tiene NFC',
    noNfcModule: 'Este build no trae todavía el módulo NFC (NfcTap). Activa las etiquetas de depuración en Ajustes para simular el toque.',
    nfcOff: 'Enciende el NFC en Ajustes',
  },
  {
    amount: 'Amount',
    cents: 'Type in cents: 1 2 0 0 → {example}',
    charge: 'Charge',
    del: 'Delete',
    saleOf: 'Sale',
    hold: "Hold the customer's phone against the back of this one",
    readerOn: 'sale {id} · reader on',
    readerSimulated: 'sale {id} · no NFC reader',
    cancel: 'Cancel',
    nfcRetry: 'Try again: hold the phones closer',
    readerStays: 'The reader stays on.',
    walletRead: 'Wallet read',
    charging: 'charging…',
    paid: '✓ Paid',
    paidAt: 'Paid at {time}',
    newSale: 'New sale',
    notPaid: '✕ Not paid',
    unconfirmed: '? Not confirmed',
    unconfirmedMsg: "Couldn't confirm the payment. Check the wallet.",
    noNfc: 'This phone has no NFC',
    noNfcModule: "This build doesn't include the NFC module (NfcTap) yet. Turn on debug labels in Settings to simulate the tap.",
    nfcOff: 'Turn NFC on in Settings',
  },
);

export default function SaleScreen() {
  return <VendorGate>{(vendor) => <Terminal vendor={vendor} />}</VendorGate>;
}

// The terminal (design: Terminal, SDD §6): amount in the smallest unit, then the sale state machine of useSale.
function Terminal({ vendor }: { vendor: VendorView }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const { debugLabels } = useSession();
  const colors = roleColors(theme, 'vendor');
  const sale = useSale(vendor.id, { simulate: debugLabels });
  const [digits, setDigits] = useState('1200');
  const money = (amount: string) => formatMoney(amount, vendor.assetScale, vendor.assetCode, lang);
  const [number] = money(digits).split(' ');
  const refused = sale.sale?.status === 'FAILED';

  return (
    <Screen>
      <ThemedText type="caption">
        {vendor.name} · {vendor.assetCode}
      </ThemedText>

      {sale.state === 'idle' ? (
        <>
          <ThemedView card>
            <ThemedText type="caption">{t.amount}</ThemedText>
            <View accessible accessibilityLiveRegion="polite" style={styles.amountRow}>
              <Text style={[styles.amountBig, { color: theme.text }]}>{number}</Text>
              <Text style={[styles.code, { color: theme.muted }]}>{vendor.assetCode}</Text>
            </View>
            <ThemedText type="caption">{fill(t.cents, { example: money('1200').split(' ')[0] })}</ThemedText>
          </ThemedView>
          <Keypad digits={digits} onChange={setDigits} deleteLabel={t.del} />
          <BigButton
            label={t.charge}
            color={Fill.vendor}
            disabled={!Number(digits) || sale.starting}
            onPress={() => sale.charge(digits)}
          />
        </>
      ) : (
        <View style={styles.center}>
          <ThemedText type="caption">{t.saleOf}</ThemedText>
          <Text style={[styles.amountSale, { color: theme.text }]}>{money(sale.sale?.amount ?? digits)}</Text>
        </View>
      )}

      {(sale.state === 'awaiting_tap' || sale.state === 'nfc_error') && (
        <>
          <View style={[styles.tapCircle, { backgroundColor: colors.tint }]}>
            <MaterialCommunityIcons name="contactless-payment" size={104} color={Brand.vendor} />
          </View>
          {sale.state === 'awaiting_tap' ? (
            <>
              <Text style={[styles.lead, { color: theme.text }]}>{t.hold}</Text>
              <View style={styles.center}>
                <StatusPill
                  tone="wait"
                  label={fill(NfcTap ? t.readerOn : t.readerSimulated, { id: sale.sale?.id ?? '' })}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.center}>
                <StatusPill tone="bad" label={sale.nfcError ?? ''} />
              </View>
              <Text style={[styles.lead, { color: theme.text }]}>{t.nfcRetry}</Text>
              <ThemedText type="caption" style={styles.centerText}>
                {t.readerStays}
              </ThemedText>
            </>
          )}
          {debugLabels && <SimulateTap onTap={sale.tap} />}
          <BigButton label={t.cancel} color={colors.ink} ghost onPress={sale.reset} />
        </>
      )}

      {sale.state === 'charging' && (
        <>
          <ActivityIndicator size="large" color={Brand.vendor} style={styles.spinner} />
          <ThemedView card style={styles.center}>
            <ThemedText type="caption">{t.walletRead}</ThemedText>
            <Text style={[styles.mono, { color: theme.text }]}>{sale.walletAddress}</Text>
          </ThemedView>
          <View style={styles.center} accessibilityLiveRegion="polite">
            <StatusPill tone="wait" label={t.charging} />
          </View>
        </>
      )}

      {sale.state === 'paid' && (
        <Outcome
          icon="check-circle-outline"
          color={theme.okInk}
          title={t.paid}
          pill={<StatusPill tone="ok" label={v.status.PAID} />}
          detail={sale.sale?.paidAt ? fill(t.paidAt, { time: time(sale.sale.paidAt, lang) }) : undefined}
          action={<BigButton label={t.newSale} color={Fill.vendor} onPress={sale.reset} />}
        />
      )}

      {sale.state === 'failed' && (
        <Outcome
          icon="close-circle-outline"
          color={theme.badInk}
          title={t.notPaid}
          message={refused && sale.sale ? failureText(sale.sale, v.failure, lang) : appFailureText(sale.failure, t, v.network)}
          pill={<StatusPill tone="bad" label={(refused && sale.sale?.failureCode) || v.status.FAILED} />}
          action={<BigButton label={t.newSale} color={Fill.vendor} onPress={sale.reset} />}
        />
      )}

      {sale.state === 'not_confirmed' && (
        <Outcome
          icon="help-circle-outline"
          color={theme.text}
          title={t.unconfirmed}
          message={t.unconfirmedMsg}
          pill={<StatusPill tone="neutral" label={v.status[sale.sale?.status ?? 'CHARGING']} />}
          action={<BigButton label={t.newSale} color={Fill.vendor} onPress={sale.reset} />}
        />
      )}
    </Screen>
  );
}

function appFailureText(failure: AppFailure | null, t: (typeof copy)['es'], networkTemplate: string) {
  if (!failure) return '';
  if (failure.code === 'NO_NFC') return t.noNfc;
  if (failure.code === 'NFC_OFF') return t.nfcOff;
  if (failure.code === 'NO_NFC_MODULE') return `${t.noNfc}. ${t.noNfcModule}`;
  return failure.error ? errorText(failure.error, networkTemplate) : '';
}

type OutcomeProps = {
  icon: 'check-circle-outline' | 'close-circle-outline' | 'help-circle-outline';
  color: string;
  title: string;
  message?: string;
  detail?: string;
  pill: ReactNode;
  action: ReactNode;
};

function Outcome({ icon, color, title, message, detail, pill, action }: OutcomeProps) {
  const theme = useTheme();
  return (
    <>
      <View style={styles.center}>
        <MaterialCommunityIcons name={icon} size={104} color={color} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.outcome, { color }]}>
        {title}
      </Text>
      {message ? <Text style={[styles.lead, { color: theme.text }]}>{message}</Text> : null}
      <View style={styles.center}>{pill}</View>
      {detail ? (
        <ThemedText type="caption" style={styles.centerText}>
          {detail}
        </ThemedText>
      ) : null}
      {action}
    </>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountBig: { fontSize: 52, lineHeight: 60, fontWeight: '800', fontVariant: ['tabular-nums'] },
  code: { fontSize: 20, fontWeight: '700' },
  center: { alignItems: 'center', gap: 4 },
  centerText: { textAlign: 'center' },
  amountSale: { fontSize: 40, lineHeight: 48, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  tapCircle: { alignSelf: 'center', width: 196, height: 196, borderRadius: 98, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 18, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  spinner: { marginVertical: 24, transform: [{ scale: 1.6 }] },
  mono: { fontFamily: 'monospace', fontSize: 12, textAlign: 'center' },
  outcome: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
});
