import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { amountInWords, formatMoney, toMinor } from '@/api/money';
import type { SaleView, VendorSummary, VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { errorText, failureText, fill, locale, time } from '@/components/vendor/format';
import { Keypad } from '@/components/vendor/keypad';
import { Numbered, OutcomeHead, Pulse, SaleButton, Steps } from '@/components/vendor/sale-ui';
import { SimulateTap } from '@/components/vendor/simulate-tap';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { Brand, Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSale, type AppFailure } from '@/hooks/use-sale';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    today: 'Hoy llevas {amount}',
    sound: 'Anunciar los pagos en voz alta',
    howMuch: '¿Cuánto vas a cobrar?',
    clear: 'Borrar',
    add: 'Sumar {amount}',
    del: 'Borrar un dígito',
    charge: 'Cobrar',
    youCharge: 'Vas a cobrar',
    approach: 'Que el cliente acerque su celular por detrás',
    waiting: 'Esperando el celular del cliente…',
    nfcRetry: 'Inténtalo de nuevo: acerca más los celulares',
    cancel: 'Cancelar cobro',
    charging: 'Cobrando',
    confirming: 'Confirmando el pago…',
    stepRead: 'Celular leído',
    stepCharge: 'Cobrando a su billetera',
    stepMoney: 'Plata en tu billetera',
    canLeave: 'El cliente ya puede retirar su celular',
    paid: '¡Pago recibido!',
    from: 'de {buyer}',
    announce: 'Recibiste {amount}',
    announced: 'Se anunció en voz alta: «{text}»',
    inWallet: 'La plata ya está en tu billetera',
    newSale: 'Nueva venta',
    receipt: 'Enviar comprobante',
    receiptText: 'Comprobante de pago · {vendor}\nMonto: {amount}\nDe: {buyer}\nHora: {time}\nVenta {code}\nPaynela',
    failed: 'No se pudo cobrar',
    nothingTaken: 'No se descontó nada al cliente',
    why: '¿Por qué?',
    youCan: 'Puedes:',
    tips: {
      limit: [
        'Cobrar una parte ahora y el resto en otra venta.',
        'Pedirle que suba su límite en su app y volver a intentar.',
        'Recibir el pago en efectivo.',
      ],
      grant: ['Pedirle al cliente que autorice la app en su billetera y volver a intentar.'],
      unknown: ['Esa tarjeta no está registrada: pedirle al cliente que active su billetera en la app.'],
      wallet: ['Intentar de nuevo en un momento.'],
    },
    otherAmount: 'Cobrar otro valor',
    retry: 'Intentar de nuevo',
    detail: 'Ver detalle técnico',
    hideDetail: 'Ocultar detalle técnico',
    unconfirmed: 'Aún no sabemos si pagó',
    slow: 'Puede pasar si la señal está lenta',
    checking: 'Seguimos revisando solos cada pocos segundos',
    before: 'Antes de entregar el producto',
    beforeSteps: ['Pídele al cliente que mire en su app si le descontaron.', 'Si no le descontaron, cobra otra vez.'],
    checkNow: 'Revisar ahora',
    chargeAgain: 'Cobrar otra vez',
    noNfc: 'Este celular no tiene NFC',
    noNfcModule: 'Este build no trae todavía el módulo NFC (NfcTap). Activa las etiquetas de depuración en Ajustes para simular el toque.',
    nfcOff: 'Enciende el NFC en los ajustes del celular',
  },
  {
    today: "Today you've made {amount}",
    sound: 'Announce payments out loud',
    howMuch: 'How much are you charging?',
    clear: 'Clear',
    add: 'Add {amount}',
    del: 'Delete a digit',
    charge: 'Charge',
    youCharge: "You're charging",
    approach: 'Have the customer hold their phone to the back of this one',
    waiting: "Waiting for the customer's phone…",
    nfcRetry: 'Try again: hold the phones closer',
    cancel: 'Cancel charge',
    charging: 'Charging',
    confirming: 'Confirming the payment…',
    stepRead: 'Phone read',
    stepCharge: 'Charging their wallet',
    stepMoney: 'Money in your wallet',
    canLeave: 'The customer can take their phone away now',
    paid: 'Payment received!',
    from: 'from {buyer}',
    announce: 'You received {amount}',
    announced: 'Announced out loud: “{text}”',
    inWallet: 'The money is already in your wallet',
    newSale: 'New sale',
    receipt: 'Send receipt',
    receiptText: 'Payment receipt · {vendor}\nAmount: {amount}\nFrom: {buyer}\nTime: {time}\nSale {code}\nPaynela',
    failed: "Couldn't charge",
    nothingTaken: 'Nothing was taken from the customer',
    why: 'Why?',
    youCan: 'You can:',
    tips: {
      limit: [
        'Charge part now and the rest in another sale.',
        'Ask them to raise their limit in their app and try again.',
        'Take the payment in cash.',
      ],
      grant: ['Ask the customer to authorize the app in their wallet and try again.'],
      unknown: ["That card isn't registered: ask the customer to turn on their wallet in the app."],
      wallet: ['Try again in a moment.'],
    },
    otherAmount: 'Charge another amount',
    retry: 'Try again',
    detail: 'Show technical details',
    hideDetail: 'Hide technical details',
    unconfirmed: "We don't know yet if they paid",
    slow: 'This can happen when the signal is slow',
    checking: 'We keep checking on our own every few seconds',
    before: 'Before handing over the product',
    beforeSteps: ['Ask the customer to check in their app whether they were charged.', "If they weren't, charge again."],
    checkNow: 'Check now',
    chargeAgain: 'Charge again',
    noNfc: 'This phone has no NFC',
    noNfcModule: "This build doesn't include the NFC module (NfcTap) yet. Turn on debug labels in Settings to simulate the tap.",
    nfcOff: "Turn NFC on in the phone's settings",
  },
);

const SALES_TAB = '/vendor/sales';
// The same cap as the keypad's nextDigits, in whole units.
const MAX_UNIT_DIGITS = 9;
// Additive quick amounts: pesos for COP, whole units of any other asset (design: Cobrar).
const COP_PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];
const UNIT_PRESETS = [1, 2, 5, 10, 20, 50];

export default function SaleScreen() {
  return <VendorGate>{(vendor) => <Terminal vendor={vendor} />}</VendorGate>;
}

// The charge flow (design: Cobrar, Esperando toque, Cobrando, Pago recibido, No se pudo cobrar, Sin confirmar; SDD §6)
// over the sale state machine of useSale.
function Terminal({ vendor }: { vendor: VendorView }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const router = useRouter();
  const { debugLabels, sound, update } = useSession();
  const sale = useSale(vendor.id, { simulate: debugLabels });
  // Whole units typed on the keypad, priced in the receiving wallet; the sale is created in its smallest unit.
  const [units, setUnits] = useState('0');
  const [showTech, setShowTech] = useState(false);
  const amount = toMinor(units, vendor.assetScale);
  const { data: today, reload: reloadToday } = useApi<VendorSummary>(
    `/vendors/${vendor.id}/summary?range=today&walletId=${vendor.defaultWalletId}`,
  );
  // A created sale keeps its own asset even if the receiving wallet changes before the tap.
  const s = sale.sale;
  const shown = s ? ([s.amount, s.assetScale, s.assetCode] as const) : ([amount, vendor.assetScale, vendor.assetCode] as const);
  const big = formatMoney(...shown, lang);
  const bigWords = amountInWords(...shown, lang);

  // One announcement per paid sale, in the UI language; its card shows once it has been said.
  const spoken = useRef<string | null>(null);
  const [announced, setAnnounced] = useState<{ id: string; text: string } | null>(null);
  const paid = sale.state === 'paid' ? s : null;
  useEffect(() => {
    if (!paid || !sound || spoken.current === paid.id) return;
    spoken.current = paid.id;
    const words = amountInWords(paid.amount, paid.assetScale, paid.assetCode, lang);
    const text = fill(t.announce, { amount: words.charAt(0).toLowerCase() + words.slice(1) });
    Speech.speak(text, { language: locale(lang), onDone: () => setAnnounced({ id: paid.id, text }) });
  }, [paid, sound, lang, t.announce]);

  useEffect(() => {
    if (paid) reloadToday();
  }, [paid, reloadToday]);

  const newSale = () => {
    setUnits('0');
    sale.reset();
  };
  const share = (done: SaleView) =>
    Share.share({
      message: fill(t.receiptText, {
        vendor: vendor.name,
        amount: formatMoney(done.amount, done.assetScale, done.assetCode, lang),
        buyer: done.buyerName ?? '—',
        time: done.paidAt ? time(done.paidAt, lang) : '',
        code: `VT-${done.id.slice(-4).toUpperCase()}`,
      }),
    }).catch(() => {});

  if (sale.state === 'idle') {
    const presets = vendor.assetCode === 'COP' ? COP_PRESETS : UNIT_PRESETS;
    const add = (more: number) =>
      setUnits((current) => {
        const next = String(Number(current) + more);
        return next.length <= MAX_UNIT_DIGITS ? next : current;
      });
    return (
      <Screen scroll={false}>
        <View style={styles.fill}>
          <View style={styles.topRow}>
            <View style={[styles.grow, styles.who]}>
              <Text numberOfLines={1} style={[styles.vendor, { color: theme.text }]}>
                {vendor.name}
              </Text>
              {today && (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push(SALES_TAB)}
                  style={({ pressed }) => [styles.chip, { backgroundColor: theme.accentTint, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.dot, { backgroundColor: theme.income }]} />
                  <Text style={[styles.chipText, { color: theme.accentInk }]}>
                    {fill(t.today, { amount: formatMoney(today.paid.total, today.assetScale, today.assetCode, lang) })} ›
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t.sound}
              accessibilityState={{ checked: sound }}
              onPress={() => update({ sound: !sound })}
              style={[styles.round, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <MaterialCommunityIcons name={sound ? 'volume-high' : 'volume-off'} size={22} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.between}>
            <ThemedText type="caption">{t.howMuch}</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: units === '0' }}
              disabled={units === '0'}
              hitSlop={12}
              onPress={() => setUnits('0')}
              style={({ pressed }) => ({ opacity: units === '0' ? 0.4 : pressed ? 0.6 : 1 })}>
              <Text style={[styles.clear, { color: theme.primaryInk }]}>{t.clear}</Text>
            </Pressable>
          </View>
          <View accessible accessibilityLabel={`${big}, ${bigWords}`} accessibilityLiveRegion="polite">
            <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amountBig, { color: theme.text }]}>
              {big}
            </Text>
            <ThemedText type="caption">{bigWords}</ThemedText>
          </View>
          <View style={styles.presets}>
            {presets.map((more) => {
              const label = `+ ${formatMoney(toMinor(String(more), vendor.assetScale), vendor.assetScale, vendor.assetCode, lang)}`;
              return (
                <Pressable
                  key={more}
                  accessibilityRole="button"
                  accessibilityLabel={fill(t.add, { amount: label.slice(2) })}
                  onPress={() => add(more)}
                  style={({ pressed }) => [
                    styles.preset,
                    { backgroundColor: pressed ? theme.primaryTint : theme.surface, borderColor: theme.border },
                  ]}>
                  <Text style={[styles.presetText, { color: theme.text }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Keypad digits={units} onChange={setUnits} deleteLabel={t.del} />
          <SaleButton
            icon="contactless-payment"
            label={`${t.charge} ${big}`}
            disabled={units === '0' || sale.starting}
            onPress={() => sale.charge(amount)}
          />
        </View>
      </Screen>
    );
  }

  if (sale.state === 'awaiting_tap' || sale.state === 'nfc_error') {
    const nfcError = sale.state === 'nfc_error';
    return (
      // The debug tap card lists buyers, so with it the screen scrolls instead of pinning the circle.
      <Screen scroll={!debugLabels}>
        <View style={styles.fill}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
              onPress={sale.reset}
              style={[styles.round, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
            </Pressable>
            <ThemedText type="caption" numberOfLines={1} style={[styles.grow, styles.centerText]}>
              {vendor.name}
            </ThemedText>
            <View style={styles.spacer} />
          </View>
          <View style={styles.center}>
            <ThemedText type="caption">{t.youCharge}</ThemedText>
            <Text style={[styles.amountSale, { color: theme.text }]}>{big}</Text>
            <ThemedText type="caption">{bigWords}</ThemedText>
          </View>
          <View style={styles.grow} />
          <Pulse />
          <View style={styles.grow} />
          <Text style={[styles.lead, { color: theme.text }]}>{nfcError ? t.nfcRetry : t.approach}</Text>
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <View style={[styles.dot, { backgroundColor: nfcError ? theme.outflow : theme.accentInk }]} />
            <ThemedText type="caption" style={{ color: nfcError ? theme.outflow : theme.muted }}>
              {nfcError ? sale.nfcError : t.waiting}
            </ThemedText>
          </View>
          <View style={styles.grow} />
          {debugLabels && <SimulateTap onTap={sale.tap} />}
          <Pressable accessibilityRole="button" onPress={sale.reset} style={styles.link}>
            <Text style={[styles.linkText, { color: theme.outflow }]}>{t.cancel}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (sale.state === 'charging') {
    return (
      <Screen scroll={false}>
        <View style={styles.fill}>
          <ThemedText type="caption" style={styles.centerText}>
            {vendor.name}
          </ThemedText>
          <View style={styles.center}>
            <ThemedText type="caption">{t.charging}</ThemedText>
            <Text style={[styles.amountSale, { color: theme.text }]}>{big}</Text>
          </View>
          <View style={styles.grow} />
          <ActivityIndicator size="large" color={Brand.teal} style={styles.spinner} />
          <Text accessibilityLiveRegion="polite" style={[styles.lead, { color: theme.text }]}>
            {t.confirming}
          </Text>
          <View style={styles.grow} />
          <Steps
            items={[
              { state: 'done', label: t.stepRead, detail: s?.buyerName ?? undefined },
              { state: 'current', label: t.stepCharge },
              { state: 'pending', label: t.stepMoney },
            ]}
          />
          <ThemedText type="caption" style={styles.centerText}>
            {t.canLeave}
          </ThemedText>
        </View>
      </Screen>
    );
  }

  if (sale.state === 'paid' && s) {
    const note = [s.buyerName ? fill(t.from, { buyer: s.buyerName }) : '', s.paidAt ? time(s.paidAt, lang) : '']
      .filter(Boolean)
      .join(' · ');
    return (
      <Screen>
        <OutcomeHead icon="check" color={Fills.income} title={t.paid} titleColor={theme.income} amount={big} note={note} />
        {announced?.id === s.id && (
          <ThemedView card style={styles.cardRow}>
            <MaterialCommunityIcons name="volume-high" size={20} color={theme.text} />
            <ThemedText style={styles.grow}>{fill(t.announced, { text: announced.text })}</ThemedText>
          </ThemedView>
        )}
        <ThemedText type="caption" style={styles.centerText}>
          {t.inWallet}
        </ThemedText>
        <View style={styles.grow} />
        <SaleButton label={t.newSale} onPress={newSale} />
        <SaleButton ghost icon="share-variant-outline" label={t.receipt} onPress={() => share(s)} />
      </Screen>
    );
  }

  // A sale the service refused is grey (nothing moved); a failure on the phone or the network is red.
  if (sale.state === 'failed') {
    const refused = s?.status === 'FAILED';
    const code = (refused && s?.failureCode) || '';
    const tips = code.includes('LIMIT')
      ? t.tips.limit
      : code === 'GRANT_MISSING'
        ? t.tips.grant
        : code === 'BUYER_UNKNOWN'
          ? t.tips.unknown
          : code === 'WALLET_ERROR'
            ? t.tips.wallet
            : [];
    const reason = refused && s ? failureText(s, v.failure, lang) : appFailureText(sale.failure, t, v.network);
    const tech = refused
      ? [code, s?.failureMessage].filter(Boolean).join('\n')
      : [sale.failure?.error?.code ?? sale.failure?.code, sale.failure?.error?.message].filter(Boolean).join('\n');
    return (
      <Screen>
        <OutcomeHead
          icon="close"
          color={refused ? Fills.refused : Fills.outflow}
          title={t.failed}
          titleColor={refused ? theme.refused : theme.outflow}
          amount={big}
          note={t.nothingTaken}
        />
        {reason ? (
          <ThemedView card>
            <ThemedText type="caption">{t.why}</ThemedText>
            <Text style={[styles.reason, { color: refused ? theme.text : theme.outflow }]}>{reason}</Text>
          </ThemedView>
        ) : null}
        {tips.length > 0 && (
          <>
            <Text style={[styles.label, { color: theme.text }]}>{t.youCan}</Text>
            <Numbered items={tips} />
          </>
        )}
        <View style={styles.grow} />
        <SaleButton label={t.otherAmount} onPress={sale.reset} />
        <SaleButton ghost label={t.retry} disabled={sale.starting} onPress={() => sale.charge(amount)} />
        {tech ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showTech }}
              onPress={() => setShowTech((open) => !open)}
              style={styles.link}>
              <Text style={[styles.linkText, styles.underline, { color: theme.muted }]}>
                {showTech ? t.hideDetail : t.detail}
              </Text>
            </Pressable>
            {showTech && (
              <ThemedView card>
                <Text selectable style={[styles.mono, { color: theme.text }]}>
                  {tech}
                </Text>
              </ThemedView>
            )}
          </>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <OutcomeHead
        icon="help"
        color={theme.accentTint}
        iconColor={theme.accentInk}
        halo={theme.accentInk}
        title={t.unconfirmed}
        titleColor={theme.text}
        amount={big}
        note={t.slow}
      />
      <ThemedView card style={styles.cardRow}>
        <MaterialCommunityIcons name="refresh" size={22} color={theme.primaryInk} />
        <ThemedText style={styles.grow}>{t.checking}</ThemedText>
      </ThemedView>
      <Text style={[styles.label, { color: theme.text }]}>{t.before}</Text>
      <Numbered items={t.beforeSteps} />
      <View style={styles.grow} />
      <SaleButton label={t.checkNow} onPress={sale.recheck} />
      <SaleButton ghost label={t.chargeAgain} disabled={sale.starting} onPress={() => sale.charge(amount)} />
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

const styles = StyleSheet.create({
  fill: { flex: 1, gap: 12 },
  grow: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  who: { gap: 6, alignItems: 'flex-start' },
  vendor: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Balances the cancel button so the vendor name stays centred.
  spacer: { width: 44 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { fontSize: 15, fontWeight: '600' },
  amountBig: { fontSize: 46, lineHeight: 54, fontWeight: '700', fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { flexGrow: 1, flexBasis: '30%', minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  center: { alignItems: 'center', gap: 2 },
  centerText: { textAlign: 'center' },
  amountSale: { fontSize: 40, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  lead: { fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  spinner: { marginVertical: 16, transform: [{ scale: 1.6 }] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 16, fontWeight: '600' },
  underline: { textDecorationLine: 'underline' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  reason: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 18 },
});
