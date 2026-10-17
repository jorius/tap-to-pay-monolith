import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, apiUrl, tunnelHeaders } from '@/api/client';

import { formatMoney } from '@/api/money';
import type { PayLink, VendorView } from '@/api/types';
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
import { useSale, type AppFailure, type ReaderState } from '@/hooks/use-sale';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    amount: 'Monto',
    clear: 'Limpiar',
    quick: 'Cobros rápidos',
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
    paidAt: 'a las {time}',
    newSale: 'Nueva venta',
    notPaid: '✕ No pagado',
    unconfirmed: '? Sin confirmar',
    unconfirmedMsg: 'No pudimos confirmar el pago. Revisa la billetera.',
    noNfc: 'Este teléfono no tiene NFC',
    noNfcModule: 'Este build no trae todavía el módulo NFC (NfcTap). Activa las etiquetas de depuración en Ajustes para simular el toque.',
    nfcOff: 'Enciende el NFC en Ajustes',
    readerOff: 'venta {id} · sin lector NFC',
    noNfcHere: 'Este teléfono no tiene NFC: cobra con el QR o por WhatsApp.',
    nfcOffHere: 'El NFC está apagado: enciéndelo en Ajustes, o cobra con el QR o por WhatsApp.',
    noModuleHere: 'Este build no trae el lector NFC: cobra con el QR o por WhatsApp.',
    otherWays: 'O sin acercar el teléfono',
    scanQr: 'El cliente escanea este código con la cámara y paga con su billetera.',
    qrLabel: 'Código QR del cobro',
    whatsapp: 'Enviar cobro por WhatsApp',
    linkError: 'No pudimos preparar el link de pago.',
    fromLink: 'Pago desde el link o el QR',
  },
  {
    amount: 'Amount',
    clear: 'Clear',
    quick: 'Quick amounts',
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
    paidAt: 'at {time}',
    newSale: 'New sale',
    notPaid: '✕ Not paid',
    unconfirmed: '? Not confirmed',
    unconfirmedMsg: "Couldn't confirm the payment. Check the wallet.",
    noNfc: 'This phone has no NFC',
    noNfcModule: "This build doesn't include the NFC module (NfcTap) yet. Turn on debug labels in Settings to simulate the tap.",
    nfcOff: 'Turn NFC on in Settings',
    readerOff: 'sale {id} · no NFC reader',
    noNfcHere: 'This phone has no NFC: charge with the QR or by WhatsApp.',
    nfcOffHere: 'NFC is off: turn it on in Settings, or charge with the QR or by WhatsApp.',
    noModuleHere: "This build doesn't include the NFC reader: charge with the QR or by WhatsApp.",
    otherWays: 'Or without a tap',
    scanQr: 'The customer scans this code with the camera and pays with their wallet.',
    qrLabel: 'QR code of the sale',
    whatsapp: 'Send the charge by WhatsApp',
    linkError: "Couldn't prepare the payment link.",
    fromLink: 'Paid from the link or the QR',
  },
);

// Quick amounts in whole units of the receiving wallet's currency.
const PRESETS = [5, 10, 15, 20, 50, 100];

export default function SaleScreen() {
  return <VendorGate>{(vendor, _replace, reload) => <Terminal vendor={vendor} reload={reload} />}</VendorGate>;
}

// The terminal (design: Terminal, SDD §6): amount in the smallest unit, then the sale state machine of useSale.
function Terminal({ vendor, reload }: { vendor: VendorView; reload: () => Promise<void> }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const { debugLabels } = useSession();
  const colors = roleColors(theme, 'vendor');
  const sale = useSale(vendor.id, { simulate: debugLabels });
  const [digits, setDigits] = useState('1200');
  // The keypad prices in the receiving wallet (the top-level fields); a created sale keeps its own wallet and asset even
  // if the receiving wallet changes before the tap.
  const money = (amount: string) => formatMoney(amount, vendor.assetScale, vendor.assetCode, lang);
  const saleAmount = sale.sale ? formatMoney(sale.sale.amount, sale.sale.assetScale, sale.sale.assetCode, lang) : money(digits);
  const [number] = money(digits).split(' ');
  const refused = sale.sale?.status === 'FAILED';

  return (
    <Screen onRefresh={reload}>
      <ThemedText type="caption">{vendor.name}</ThemedText>

      {sale.state === 'idle' ? (
        <>
          <ThemedView card>
            <View style={styles.amountHead}>
              <ThemedText type="caption">{t.amount}</ThemedText>
              <Pressable
                accessibilityRole="button"
                disabled={digits === '0'}
                hitSlop={12}
                onPress={() => setDigits('0')}
                style={({ pressed }) => ({ opacity: digits === '0' ? 0.4 : pressed ? 0.6 : 1 })}>
                <Text style={[styles.clear, { color: colors.ink }]}>{t.clear}</Text>
              </Pressable>
            </View>
            <View accessible accessibilityLiveRegion="polite" style={styles.amountRow}>
              <Text style={[styles.amountBig, { color: theme.text }]}>{number}</Text>
              <Text style={[styles.code, { color: theme.muted }]}>{vendor.assetCode}</Text>
            </View>
            <ThemedText type="caption">{fill(t.cents, { example: money('1200').split(' ')[0] })}</ThemedText>
          </ThemedView>
          <View accessibilityLabel={t.quick} style={styles.presets}>
            {PRESETS.map((units) => {
              // Whole units to the smallest unit as text, so no float ever touches the amount.
              const preset = `${units}${'0'.repeat(vendor.assetScale)}`;
              return (
                <Pressable
                  key={units}
                  accessibilityRole="button"
                  accessibilityLabel={money(preset)}
                  onPress={() => setDigits(preset)}
                  style={({ pressed }) => [
                    styles.preset,
                    { backgroundColor: theme.card, borderColor: digits === preset ? colors.ink : theme.card, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <Text style={[styles.presetText, { color: theme.text }]}>
                    {units} {vendor.assetCode}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
          <Text style={[styles.amountSale, { color: theme.text }]}>{saleAmount}</Text>
        </View>
      )}

      {(sale.state === 'awaiting_tap' || sale.state === 'nfc_error') && (
        <>
          {sale.reader === 'on' ? (
            <>
              <View style={[styles.tapCircle, { backgroundColor: colors.tint }]}>
                <MaterialCommunityIcons name="contactless-payment" size={104} color={Brand.vendor} />
              </View>
              {sale.state === 'awaiting_tap' ? (
                <>
                  <Text style={[styles.lead, { color: theme.text }]}>{t.hold}</Text>
                  <View style={styles.center}>
                    <StatusPill tone="wait" label={fill(t.readerOn, { id: sale.sale?.id ?? '' })} />
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
            </>
          ) : (
            <>
              <Text style={[styles.lead, { color: theme.text }]}>{readerText(sale.reader, t)}</Text>
              <View style={styles.center}>
                <StatusPill tone="wait" label={fill(t.readerOff, { id: sale.sale?.id ?? '' })} />
              </View>
            </>
          )}
          {sale.sale && <OtherWays saleId={sale.sale.id} />}
          {debugLabels && <SimulateTap onTap={sale.tap} />}
          <BigButton label={t.cancel} color={colors.ink} ghost onPress={sale.reset} />
        </>
      )}

      {sale.state === 'charging' && (
        <>
          <ActivityIndicator size="large" color={Brand.vendor} style={styles.spinner} />
          <ThemedView card style={styles.center}>
            <ThemedText type="caption">{sale.walletAddress ? t.walletRead : t.fromLink}</ThemedText>
            {sale.walletAddress ? <Text style={[styles.mono, { color: theme.text }]}>{sale.walletAddress}</Text> : null}
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

function readerText(reader: ReaderState, t: (typeof copy)['es']) {
  if (reader === 'no_nfc') return t.noNfcHere;
  if (reader === 'nfc_off') return t.nfcOffHere;
  return t.noModuleHere;
}

// The two ways to pay without a tap. Both open the service's payment page, which calls the same charge as the tap.
function OtherWays({ saleId }: { saleId: string }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const [link, setLink] = useState<PayLink | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<PayLink>(`/sales/${saleId}/pay-link`)
      .then((l) => alive && setLink(l))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [saleId]);

  return (
    <ThemedView card style={styles.center}>
      <ThemedText type="caption">{t.otherWays}</ThemedText>
      <Image
        accessibilityLabel={t.qrLabel}
        source={{ uri: `${apiUrl}/sales/${encodeURIComponent(saleId)}/qr.png`, headers: tunnelHeaders }}
        style={styles.qr}
      />
      <ThemedText type="caption" style={styles.centerText}>
        {t.scanQr}
      </ThemedText>
      <View style={styles.fullWidth}>
        <BigButton label={t.whatsapp} color={WHATSAPP} disabled={!link} onPress={() => link && Linking.openURL(link.whatsappUrl)} />
      </View>
      {failed ? <Text style={[styles.centerText, { color: theme.badInk }]}>{t.linkError}</Text> : null}
    </ThemedView>
  );
}

// WhatsApp's dark green: white text on it passes contrast, unlike the brand's light green.
const WHATSAPP = '#128C7E';

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
  // Left out where it would repeat the title (a paid sale).
  pill?: ReactNode;
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
      {pill ? <View style={styles.center}>{pill}</View> : null}
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
  amountHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clear: { fontSize: 15, fontWeight: '700' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { flexGrow: 1, minWidth: '30%', minHeight: 48, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 16, fontWeight: '700' },
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
  qr: { width: 220, height: 220, marginVertical: 8, backgroundColor: '#FFFFFF', borderRadius: 12 },
  fullWidth: { alignSelf: 'stretch', marginTop: 8 },
});
