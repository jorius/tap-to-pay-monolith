import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { formatMoney } from '@/api/money';
import type { BuyerWalletView } from '@/api/types';
import { AddWalletSheet } from '@/components/add-wallet-sheet';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { walletSite } from '@/components/vendor/format';
import { useWalletError } from '@/components/wallet-error';
import { Brand, Fill, roleColors } from '@/constants/theme';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

const copy = defineCopy(
  {
    walletLabel: (code: string) => `Billetera ${code}`,
    on: 'Activa',
    off: 'Inactiva',
    defaultBadge: 'Predeterminada',
    cardN: (i: number, n: number, code: string) => `Billetera ${i} de ${n}, ${code}`,
    isCard: '✓ Este teléfono es tu tarjeta',
    hce: 'HCE activa',
    screenOn: 'Responde con la pantalla encendida, aunque esté bloqueada.',
    deactivate: 'Desactivar',
    activate: 'Usar este teléfono como mi tarjeta',
    needs: 'Necesita tu autorización y un teléfono con HCE (android.hardware.nfc.hce).',
    noGrant: 'Falta la autorización de esta billetera.',
    noHce: 'Este teléfono no reporta HCE.',
    noModule: 'Este build todavía no trae el módulo NFC.',
    simulated: 'Simulación de depuración: sin módulo NFC el teléfono no responde a toques reales.',
    makeDefault: 'Establecer como predeterminada',
    defaultNote: 'Con la app cerrada o en otra pantalla, el teléfono paga con la predeterminada.',
    shownPays: 'Mientras la veas aquí, los toques pagan con esta billetera. Con la app cerrada o en otra pantalla paga la predeterminada.',
    paysDefault: 'Sin autorización: los toques pagan con tu billetera predeterminada.',
    leftToday: 'Disponible hoy',
    authorized: 'Autorizado en tu billetera',
    perDay: (limit: string, left: string) => `${limit} por día · quedan ${left}`,
    noCap: 'Sin tope de monto en la autorización · el servicio aplica tus topes.',
    unauthorized: 'Sin autorización',
    grantHow: 'Autorízala una vez desde el portátil (en el MVP será desde la app):',
    overGrant: (limit: string) =>
      `Tu tope diario supera lo autorizado: los pagos se detienen en ${limit}. Renueva la autorización para subirlo.`,
    realBalance: 'Saldo real',
    realBalanceNote: 'Open Payments no comparte el saldo de tu billetera: solo tu proveedor lo muestra.',
    openWallet: 'Abrir mi billetera',
    limits: 'Topes de esta billetera',
    perPayment: 'Tope por pago',
    daily: 'Tope diario',
    units: (per: string, day: string) => `Se guardan en la unidad mínima: ${per} · ${day}`,
    save: 'Guardar topes',
    saved: 'Topes guardados',
    wallets: 'Tus billeteras',
    addWallet: 'Agregar billetera',
    removeWallet: 'Quitar esta billetera',
    onlyOne: 'Es tu única billetera: agrega otra antes de quitarla.',
    removeTitle: (code: string) => `¿Quitar la billetera ${code}?`,
    removeBody: 'Deja de ser una de tus tarjetas. Su historial de cobros se conserva en el servicio.',
    cancel: 'Cancelar',
    remove: 'Quitar',
    pickAgain: 'Elegir otro comprador',
  },
  {
    walletLabel: (code: string) => `${code} wallet`,
    on: 'Active',
    off: 'Inactive',
    defaultBadge: 'Default',
    cardN: (i: number, n: number, code: string) => `Wallet ${i} of ${n}, ${code}`,
    isCard: '✓ This phone is your card',
    hce: 'HCE active',
    screenOn: 'It answers with the screen on, even when locked.',
    deactivate: 'Deactivate',
    activate: 'Use this phone as my card',
    needs: 'Needs your authorization and a phone with HCE (android.hardware.nfc.hce).',
    noGrant: 'This wallet is not authorized yet.',
    noHce: 'This phone does not report HCE.',
    noModule: 'This build does not include the NFC module yet.',
    simulated: 'Debug simulation: without the NFC module the phone does not answer real taps.',
    makeDefault: 'Set as default',
    defaultNote: 'With the app closed or on another screen, the phone pays with the default one.',
    shownPays: 'While you see it here, taps pay with this wallet. With the app closed or on another screen, the default one pays.',
    paysDefault: 'Not authorized: taps pay with your default wallet.',
    leftToday: 'Left today',
    authorized: 'Authorized in your wallet',
    perDay: (limit: string, left: string) => `${limit} per day · ${left} left`,
    noCap: 'No amount cap in the authorization · the service applies your limits.',
    unauthorized: 'Not authorized',
    grantHow: 'Authorize it once from the laptop (in the MVP it will be from the app):',
    overGrant: (limit: string) =>
      `Your daily limit is above what you authorized: payments stop at ${limit}. Renew the authorization to raise it.`,
    realBalance: 'Real balance',
    realBalanceNote: 'Open Payments does not share your wallet balance: only your provider shows it.',
    openWallet: 'Open my wallet',
    limits: 'Limits of this wallet',
    perPayment: 'Per-payment limit',
    daily: 'Daily limit',
    units: (per: string, day: string) => `Stored in the smallest unit: ${per} · ${day}`,
    save: 'Save limits',
    saved: 'Limits saved',
    wallets: 'Your wallets',
    addWallet: 'Add a wallet',
    removeWallet: 'Remove this wallet',
    onlyOne: 'It is your only wallet: add another one before removing it.',
    removeTitle: (code: string) => `Remove the ${code} wallet?`,
    removeBody: 'It stops being one of your cards. Its charge history stays in the service.',
    cancel: 'Cancel',
    remove: 'Remove',
    pickAgain: 'Pick another buyer',
  },
);

// The buyer's cards (design: BuyerCard): swipe between the buyer's wallets, pick the default one, activate HCE, and see
// per wallet what is left today, what the wallet authorized and the limits. A tap pays with the card on screen.
export default function CardScreen() {
  const cards = useBuyerCards();
  const { update } = useSession();
  const t = useCopy(copy);
  return (
    <Screen onRefresh={cards.reload}>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.error?.code === 'BUYER_NOT_FOUND' && (
        <BigButton label={t.pickAgain} color={Fill.buyer} onPress={() => update({ buyerId: null })} />
      )}
      {cards.buyer && cards.wallets.length > 0 && <Cards {...cards} name={cards.buyer.name} />}
    </Screen>
  );
}

type CardsProps = ReturnType<typeof useBuyerCards> & { name: string };

function Cards({ name, wallets, defaultWallet, setDefault, addWallet, removeWallet, updateLimits }: CardsProps) {
  const { debugLabels } = useSession();
  const theme = useTheme();
  const colors = roleColors(theme, 'buyer');
  const t = useCopy(copy);
  const walletError = useWalletError();
  const width = useWindowDimensions().width - 40; // the Screen pads 20 on each side
  const pager = useRef<ScrollView>(null);
  // Set when a card was just added: the pager scrolls there once the new page exists.
  const pendingPage = useRef<number | null>(null);
  const [index, setIndex] = useState(() => Math.max(0, wallets.findIndex((w) => w.isDefault)));
  const [payload, setPayload] = useState(() => NfcTap?.getCardPayload() ?? null);
  // shortcut: without the NfcTap native module (SDD §6) a debug-only flag stands in for setCardPayload and always
  // follows the default wallet; drop it with P8.
  const [simulatedOn, setSimulatedOn] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The wallets tab can switch the default (and with it the payload), so re-read it whenever this tab shows.
  useFocusEffect(
    useCallback(() => {
      setPayload(NfcTap?.getCardPayload() ?? null);
    }, []),
  );

  const simulating = !NfcTap && debugLabels;
  const at = Math.min(index, wallets.length - 1);
  const wallet = wallets[at];
  // The phone is a card once the default wallet's address is stored. Then a tap pays with the card on screen when it
  // is authorized, and with the default one otherwise (and whenever the app is closed or on another screen).
  const isCard =
    defaultWallet !== null &&
    (NfcTap ? payload === defaultWallet.walletAddress : simulating && simulatedOn && defaultWallet.hasGrant);
  const paying = isCard ? (wallet.hasGrant ? wallet : defaultWallet) : null;
  useFocusEffect(
    useCallback(() => {
      // An APK built before setShownCard existed lacks it; there the default card keeps answering.
      NfcTap?.setShownCard?.(wallet.hasGrant ? wallet.walletAddress : null);
      return () => NfcTap?.setShownCard?.(null);
    }, [wallet.hasGrant, wallet.walletAddress]),
  );
  const hce = NfcTap ? NfcTap.isHceSupported() : simulating;
  const reason = !wallet.hasGrant ? t.noGrant : hce ? null : NfcTap ? t.noHce : t.noModule;

  const show = (i: number) => {
    setIndex(i);
    setActionError(null);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  // Runs one wallet write, keeps the HCE payload in view in step, and words a failure under the buttons.
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(walletError(e));
    } finally {
      setPayload(NfcTap?.getCardPayload() ?? null);
      setBusy(false);
    }
  };

  const setActive = (target: BuyerWalletView | null) => {
    if (!NfcTap) {
      setSimulatedOn(target !== null);
      return;
    }
    NfcTap.setCardPayload(target?.walletAddress ?? null);
    setPayload(NfcTap.getCardPayload());
  };

  const confirmRemove = () =>
    Alert.alert(t.removeTitle(wallet.assetCode), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.remove,
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await removeWallet(wallet);
            show(Math.max(0, at - 1));
          }),
      },
    ]);

  return (
    <>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={() => pager.current?.scrollTo({ x: at * width, animated: false })}
        onContentSizeChange={() => {
          if (pendingPage.current === null) return;
          pager.current?.scrollTo({ x: pendingPage.current * width, animated: true });
          pendingPage.current = null;
        }}
        onMomentumScrollEnd={(e) => show(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {wallets.map((w) => (
          <CardFace key={w.id} name={w.publicName ?? name} wallet={w} width={width} active={paying?.id === w.id} />
        ))}
      </ScrollView>
      {wallets.length > 1 && (
        <View style={styles.dots}>
          {wallets.map((w, i) => (
            <Pressable
              key={w.id}
              accessibilityRole="button"
              accessibilityLabel={t.cardN(i + 1, wallets.length, w.assetCode)}
              accessibilityState={{ selected: i === at }}
              onPress={() => show(i)}
              style={styles.dotHit}>
              <View
                style={[styles.dot, i === at ? { width: 22, backgroundColor: colors.ink } : { backgroundColor: theme.border }]}
              />
            </Pressable>
          ))}
        </View>
      )}

      {paying?.id === wallet.id ? (
        <View style={styles.section} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <ThemedText style={styles.isCard}>{t.isCard}</ThemedText>
            <StatusPill tone="ok" label={t.hce} />
          </View>
          <ThemedText type="caption">{wallet.isDefault ? t.screenOn : t.shownPays}</ThemedText>
          <BigButton label={t.deactivate} color={colors.ink} ghost onPress={() => setActive(null)} />
        </View>
      ) : wallet.isDefault ? (
        <View style={styles.section}>
          <BigButton label={t.activate} color={Fill.buyer} disabled={reason !== null} onPress={() => setActive(wallet)} />
          <ThemedText type="caption">{t.needs}</ThemedText>
          {reason && <StatusPill tone="neutral" label={reason} />}
        </View>
      ) : isCard ? (
        <StatusPill tone="neutral" label={t.paysDefault} />
      ) : null}
      {!wallet.isDefault && (
        <View style={styles.section}>
          <BigButton
            label={t.makeDefault}
            color={Fill.buyer}
            disabled={busy}
            onPress={() => run(() => setDefault(wallet))}
          />
          <ThemedText type="caption">{t.defaultNote}</ThemedText>
        </View>
      )}
      {simulating && <StatusPill tone="wait" label={t.simulated} />}

      <Authorized wallet={wallet} />
      <ThemedView card>
        <ThemedText type="caption" style={styles.sectionLabel}>
          {t.realBalance}
        </ThemedText>
        <ThemedText>{t.realBalanceNote}</ThemedText>
        <BigButton label={t.openWallet} color={colors.ink} ghost onPress={() => Linking.openURL(walletSite(wallet.walletAddress))} />
      </ThemedView>
      <Limits key={wallet.id} wallet={wallet} onSave={(limits) => updateLimits(wallet, limits)} />

      <View style={styles.section}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {t.wallets}
        </ThemedText>
        <BigButton label={t.addWallet} color={colors.ink} ghost onPress={() => setAdding(true)} />
        <BigButton
          label={t.removeWallet}
          color={theme.badInk}
          ghost
          disabled={busy || wallets.length === 1}
          onPress={confirmRemove}
        />
        {wallets.length === 1 && <ThemedText type="caption">{t.onlyOne}</ThemedText>}
        <View accessibilityLiveRegion="polite">{actionError && <StatusPill tone="bad" label={actionError} />}</View>
      </View>

      <AddWalletSheet
        role="buyer"
        visible={adding}
        onClose={() => setAdding(false)}
        onAdd={addWallet}
        onAdded={(added) => {
          if (!added) return;
          // Wallets come in creation order, so the new one is the page after the current last.
          pendingPage.current = wallets.length;
          setIndex(wallets.length);
        }}
      />
    </>
  );
}

function CardFace({ name, wallet, width, active }: { name: string; wallet: BuyerWalletView; width: number; active: boolean }) {
  const t = useCopy(copy);
  const left = formatMoney(wallet.remainingToday, wallet.assetScale, wallet.assetCode, useLang());
  return (
    <View style={{ width }}>
      <View
        accessible
        accessibilityLabel={[
          t.walletLabel(wallet.assetCode),
          `${t.leftToday} ${left}`,
          name,
          wallet.isDefault && t.defaultBadge,
          (active || wallet.isDefault) && (active ? t.on : t.off),
        ]
          .filter(Boolean)
          .join(', ')}
        style={[styles.card, { backgroundColor: wallet.isDefault ? Fill.buyer : Brand.postgres }]}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t.walletLabel(wallet.assetCode)}</Text>
          <MaterialCommunityIcons name="contactless-payment" size={32} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.cardCaption}>{t.leftToday}</Text>
          <Text style={styles.cardAmount} numberOfLines={1}>
            {left}
          </Text>
        </View>
        <Text style={styles.cardWallet} numberOfLines={1}>
          {wallet.walletAddress.replace(/^https?:\/\//, '')}
        </Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.cardChips}>
            {wallet.isDefault && (
              <View style={styles.cardState}>
                <Text style={styles.cardLabel}>{t.defaultBadge}</Text>
              </View>
            )}
            {(active || wallet.isDefault) && (
              <View style={styles.cardState}>
                <Text style={styles.cardLabel}>{active ? t.on : t.off}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}


// What the wallet's consent allows per day; a wallet without a grant shows the command that gives one.
function Authorized({ wallet }: { wallet: BuyerWalletView }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const money = (digits: string) => formatMoney(digits, wallet.assetScale, wallet.assetCode, lang);
  const limit = wallet.grantDailyLimit ?? null;
  const over = limit !== null && BigInt(wallet.dailyLimit) > BigInt(limit);
  return (
    <ThemedView card>
      <ThemedText type="caption" style={styles.sectionLabel}>
        {t.authorized}
      </ThemedText>
      {!wallet.hasGrant ? (
        <>
          <StatusPill tone="neutral" label={t.unauthorized} />
          <ThemedText type="caption">{t.grantHow}</ThemedText>
          <Text selectable style={[styles.command, { color: theme.text, backgroundColor: theme.background }]}>
            npm run grant:buyer -- --buyer {wallet.walletAddress}
          </Text>
        </>
      ) : limit === null ? (
        <ThemedText>{t.noCap}</ThemedText>
      ) : (
        <ThemedText style={styles.strong}>{t.perDay(money(limit), money(wallet.grantRemainingToday ?? '0'))}</ThemedText>
      )}
      {over && <StatusPill tone="wait" label={t.overGrant(money(limit))} />}
    </ThemedView>
  );
}

type LimitValues = { perPaymentLimit: string; dailyLimit: string };
type SaveStatus = { ok: true } | { ok: false; message: string } | null;

function Limits({ wallet, onSave }: { wallet: BuyerWalletView; onSave: (limits: LimitValues) => Promise<unknown> }) {
  const t = useCopy(copy);
  const walletError = useWalletError();
  // null shows what the service has; a string is an unsaved edit in the smallest unit.
  const [per, setPer] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [saving, setSaving] = useState(false);
  const perDigits = per ?? wallet.perPaymentLimit;
  const dayDigits = day ?? wallet.dailyLimit;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ perPaymentLimit: perDigits, dailyLimit: dayDigits });
      setStatus({ ok: true });
    } catch (e) {
      // The service's VALIDATION message (e.g. "perPaymentLimit must be ≤ dailyLimit") is shown as it comes.
      setStatus({ ok: false, message: walletError(e) });
    } finally {
      setSaving(false);
    }
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setStatus(null);
  };

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {t.limits}
      </ThemedText>
      <LimitField label={t.perPayment} digits={perDigits} wallet={wallet} onChange={edit(setPer)} />
      <LimitField label={t.daily} digits={dayDigits} wallet={wallet} onChange={edit(setDay)} />
      <ThemedText type="caption">{t.units(perDigits, dayDigits)}</ThemedText>
      <BigButton label={t.save} color={Fill.buyer} disabled={saving} onPress={save} />
      <View accessibilityLiveRegion="polite">
        {status?.ok && <StatusPill tone="ok" label={t.saved} />}
        {status && !status.ok && <StatusPill tone="bad" label={status.message} />}
      </View>
    </View>
  );
}

type LimitFieldProps = { label: string; digits: string; wallet: BuyerWalletView; onChange: (digits: string) => void };

// Cents-shift entry: only the digits typed count, so the keyboard's decimal key or locale can never move the comma.
function LimitField({ label, digits, wallet, onChange }: LimitFieldProps) {
  const theme = useTheme();
  const lang = useLang();
  return (
    <View style={styles.field}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <View style={[styles.inputBox, { borderColor: theme.border }]}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={formatMoney(digits, wallet.assetScale, '', lang).trimEnd()}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')}
          style={[styles.input, { color: theme.text }]}
        />
        <Text style={[styles.unit, { color: theme.muted }]}>{wallet.assetCode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { height: 188, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 20, justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardCaption: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  cardAmount: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardWallet: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'monospace' },
  cardName: { flexShrink: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  cardChips: { flexDirection: 'row', gap: 6 },
  cardState: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dotHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { gap: 10 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  isCard: { fontSize: 19, fontWeight: '800' },
  sectionLabel: { fontWeight: '700' },
  strong: { fontWeight: '700' },
  command: { fontFamily: 'monospace', fontSize: 12.5, lineHeight: 18, padding: 10, borderRadius: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 48, fontSize: 20, fontWeight: '700' },
  unit: { fontSize: 15, fontWeight: '700' },
});
