import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { buyerAmount, formatMoney } from '@/api/money';
import type { BuyerSales, BuyerView, BuyerWalletView, SaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { cardBlocker, currencyName, useBuyerCards, type CardBlocker } from '@/hooks/use-buyer-cards';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

const copy = defineCopy(
  {
    hello: (name: string) => `Hola, ${name}`,
    help: 'Ayuda',
    helpTitle: '¿Cómo pago?',
    helpBody:
      'Con los pagos prendidos, acerca tu celular al del vendedor y listo: no necesitas abrir la app. Nunca se cobra más de lo que permitas en Mis límites, y puedes apagar los pagos cuando quieras.',
    myWallet: 'Mi billetera',
    leftToday: 'Disponible hoy',
    main: 'Principal',
    cardN: (i: number, n: number, code: string) => `Billetera ${i} de ${n}, ${code}`,
    ready: 'Lista para pagar',
    off: 'Pagos apagados',
    notReady: 'Falta activar',
    readyHint: 'Acerca tu celular al del vendedor. Funciona con la pantalla bloqueada.',
    offHint: 'Prende el interruptor y este celular paga por ti.',
    toggle: 'Pagar con este celular',
    blockers: {
      module: 'Este build no trae el módulo NFC.',
      nfc: 'Este celular no tiene NFC.',
      nfcOff: 'El NFC del celular está apagado.',
      hce: 'Este celular no puede actuar como tarjeta.',
      grant: 'Tu billetera todavía no le dio permiso a la app.',
    },
    activate: 'Activar pagos',
    shownPays: 'Mientras la veas aquí, los toques pagan con esta billetera. Con la app cerrada o en otra pantalla paga la principal.',
    paysDefault: 'Sin permiso: los toques pagan con tu billetera principal.',
    simulated: 'Simulación de depuración: sin módulo NFC el teléfono no responde a toques reales.',
    limits: 'Mis límites',
    perPurchase: (amount: string) => `Hasta ${amount} por compra`,
    lastPayment: 'Último pago',
    noPayments: 'Todavía no has pagado',
    notPaid: 'No se pagó',
    inProgress: 'En curso',
    pickAgain: 'Elegir otro comprador',
  },
  {
    hello: (name: string) => `Hi, ${name}`,
    help: 'Help',
    helpTitle: 'How do I pay?',
    helpBody:
      "With payments on, hold your phone against the seller's and that's it: no need to open the app. You are never charged more than you allow in My limits, and you can turn payments off anytime.",
    myWallet: 'My wallet',
    leftToday: 'Left today',
    main: 'Main',
    cardN: (i: number, n: number, code: string) => `Wallet ${i} of ${n}, ${code}`,
    ready: 'Ready to pay',
    off: 'Payments off',
    notReady: 'Needs setup',
    readyHint: "Hold your phone against the seller's. It works with the screen locked.",
    offHint: 'Turn the switch on and this phone pays for you.',
    toggle: 'Pay with this phone',
    blockers: {
      module: 'This build does not include the NFC module.',
      nfc: 'This phone has no NFC.',
      nfcOff: 'NFC is off on this phone.',
      hce: 'This phone cannot act as a card.',
      grant: 'Your wallet has not given the app permission yet.',
    },
    activate: 'Turn on payments',
    shownPays: 'While you see it here, taps pay with this wallet. With the app closed or on another screen, the main one pays.',
    paysDefault: 'No permission: taps pay with your main wallet.',
    simulated: 'Debug simulation: without the NFC module the phone does not answer real taps.',
    limits: 'My limits',
    perPurchase: (amount: string) => `Up to ${amount} per purchase`,
    lastPayment: 'Last payment',
    noPayments: 'No payments yet',
    notPaid: 'Not paid',
    inProgress: 'In progress',
    pickAgain: 'Pick another buyer',
  },
);

// The buyer's home (design: Inicio): the greeting, the wallet cards with what is left today, the switch that makes
// this phone pay, and the way to the limits and the last payment. A tap pays with the card on screen.
export default function CardScreen() {
  const cards = useBuyerCards();
  const { buyerId, update } = useSession();
  const t = useCopy(copy);
  const last = useApi<BuyerSales>(buyerId ? `/buyers/${buyerId}/sales?limit=1` : null, { pollMs: 3000 });
  const newest = last.data?.sales[0];
  const key = newest ? `${newest.id}:${newest.status}` : null;
  const reloadCards = cards.reload;
  // A tap's outcome changes what is left today, so the cards follow the newest sale.
  useEffect(() => {
    if (key) void reloadCards();
  }, [key, reloadCards]);

  return (
    <Screen onRefresh={() => Promise.all([cards.reload(), last.reload()])}>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.error?.code === 'BUYER_NOT_FOUND' && (
        <BigButton label={t.pickAgain} color={Fills.primary} onPress={() => update({ buyerId: null })} />
      )}
      {cards.buyer && cards.wallets.length > 0 && (
        <Home buyer={cards.buyer} wallets={cards.wallets} defaultWallet={cards.defaultWallet} lastSale={newest ?? null} />
      )}
    </Screen>
  );
}

type HomeProps = { buyer: BuyerView; wallets: BuyerWalletView[]; defaultWallet: BuyerWalletView | null; lastSale: SaleView | null };

function Home({ buyer, wallets, defaultWallet, lastSale }: HomeProps) {
  const { debugLabels } = useSession();
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const router = useRouter();
  const width = useWindowDimensions().width - 40; // the Screen pads 20 on each side
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(() => Math.max(0, wallets.findIndex((w) => w.isDefault)));
  const [payload, setPayload] = useState(() => NfcTap?.getCardPayload() ?? null);
  const [nfcBlocker, setNfcBlocker] = useState(() => cardBlocker(defaultWallet));
  // shortcut: without the NfcTap native module (SDD §6) a debug-only flag stands in for setCardPayload and always
  // follows the default wallet; drop it with P8.
  const [simulatedOn, setSimulatedOn] = useState(false);
  // Cuenta can switch the default (and with it the payload), and NFC or the grant can change meanwhile, so both are
  // re-read whenever this tab shows.
  useFocusEffect(
    useCallback(() => {
      setPayload(NfcTap?.getCardPayload() ?? null);
      setNfcBlocker(cardBlocker(defaultWallet));
    }, [defaultWallet]),
  );

  const simulating = !NfcTap && debugLabels;
  const at = Math.min(index, wallets.length - 1);
  const wallet = wallets[at];
  // The phone is a card once the default wallet's address is stored. Then a tap pays with the card on screen when it
  // is authorized, and with the default one otherwise (and whenever the app is closed or on another screen).
  const on =
    defaultWallet !== null &&
    (NfcTap ? payload === defaultWallet.walletAddress : simulating && simulatedOn && defaultWallet.hasGrant);
  const blocker: CardBlocker | null = simulating ? (defaultWallet?.hasGrant ? null : 'grant') : nfcBlocker;
  useFocusEffect(
    useCallback(() => {
      // An APK built before setShownCard existed lacks it; there the default card keeps answering.
      NfcTap?.setShownCard?.(wallet.hasGrant ? wallet.walletAddress : null);
      return () => NfcTap?.setShownCard?.(null);
    }, [wallet.hasGrant, wallet.walletAddress]),
  );

  const show = (i: number) => {
    setIndex(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  const setOn = (next: boolean) => {
    if (!NfcTap) {
      setSimulatedOn(next);
      return;
    }
    NfcTap.setCardPayload(next ? (defaultWallet?.walletAddress ?? null) : null);
    setPayload(NfcTap.getCardPayload());
  };

  const hint = blocker
    ? t.blockers[blocker]
    : on && !wallet.isDefault
      ? wallet.hasGrant
        ? t.shownPays
        : t.paysDefault
      : on
        ? t.readyHint
        : t.offHint;
  const lastText = !lastSale
    ? t.noPayments
    : `${lastSale.status === 'PAID' ? buyerAmount(lastSale, lang) : lastSale.status === 'FAILED' ? t.notPaid : t.inProgress} · ${lastSale.vendorName ?? '—'}`;

  return (
    <>
      <View style={styles.greeting}>
        <ThemedText type="title" accessibilityRole="header" style={styles.hello}>
          {t.hello(buyer.name.trim().split(/\s+/)[0])}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.help}
          onPress={() => Alert.alert(t.helpTitle, t.helpBody)}
          style={({ pressed }) => [
            styles.help,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <MaterialCommunityIcons name="help-circle-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={() => pager.current?.scrollTo({ x: at * width, animated: false })}
        onMomentumScrollEnd={(e) => show(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {wallets.map((w) => (
          <CardFace key={w.id} wallet={w} holder={buyer.name} width={width} />
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
                style={[styles.dot, i === at ? { width: 22, backgroundColor: theme.primaryInk } : { backgroundColor: theme.border }]}
              />
            </Pressable>
          ))}
        </View>
      )}

      <ThemedView card accessibilityLiveRegion="polite">
        <View style={styles.readyRow}>
          <View style={styles.readyText}>
            <View style={styles.inline}>
              <View style={[styles.statusDot, { backgroundColor: on ? theme.income : theme.idle }]} />
              <Text style={[styles.readyTitle, { color: on ? theme.income : theme.text }]}>
                {on ? t.ready : blocker ? t.notReady : t.off}
              </Text>
            </View>
            <ThemedText type="caption">{hint}</ThemedText>
          </View>
          <Switch
            accessibilityLabel={t.toggle}
            value={on}
            disabled={blocker !== null && !on}
            onValueChange={setOn}
            trackColor={{ false: theme.idle, true: Fills.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
        {blocker && !on && <BigButton label={t.activate} color={Fills.primary} onPress={() => router.push('/buyer/activate')} />}
      </ThemedView>
      {simulating && <StatusPill tone="wait" label={t.simulated} />}

      <View style={styles.tiles}>
        <Tile
          icon="shield-check-outline"
          title={t.limits}
          body={t.perPurchase(formatMoney(wallet.perPaymentLimit, wallet.assetScale, wallet.assetCode, lang))}
          onPress={() => router.push('/buyer/limits')}
        />
        <Tile icon="clock-outline" title={t.lastPayment} body={lastText} onPress={() => router.push('/buyer/history')} />
      </View>
    </>
  );
}

// One wallet as a card: its name, currency and holder, what it can still spend today, and the Principal badge.
function CardFace({ wallet, holder, width }: { wallet: BuyerWalletView; holder: string; width: number }) {
  const t = useCopy(copy);
  const lang = useLang();
  const left = formatMoney(wallet.remainingToday, wallet.assetScale, wallet.assetCode, lang);
  // The buyer is named after the default wallet's public name, so that name stays on the holder line only.
  const name = wallet.publicName && wallet.publicName !== holder ? wallet.publicName : t.myWallet;
  const currency = currencyName(wallet.assetCode, lang);
  return (
    <View style={{ width }}>
      <View
        accessible
        accessibilityLabel={[name, currency, `${t.leftToday} ${left}`, holder, wallet.isDefault && t.main].filter(Boolean).join(', ')}
        style={[styles.card, wallet.isDefault ? { backgroundColor: Brand.teal } : styles.otherCard]}>
        <View style={styles.cardRow}>
          <View style={styles.shrink}>
            <Text style={styles.cardName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.cardCaption}>{currency}</Text>
          </View>
          <MaterialCommunityIcons name="contactless-payment" size={30} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.cardCaption}>{t.leftToday}</Text>
          <Text style={styles.cardAmount} numberOfLines={1}>
            {left}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardHolder} numberOfLines={1}>
            {holder}
          </Text>
          {wallet.isDefault && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t.main}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

type TileProps = { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; body: string; onPress: () => void };

function Tile({ icon, title, body, onPress }: TileProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={22} color={theme.text} />
      <ThemedText style={styles.tileTitle}>{title}</ThemedText>
      <ThemedText type="caption">{body}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hello: { flexShrink: 1 },
  help: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { height: 196, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 20, justifyContent: 'space-between' },
  // The default card wears the brand's teal, the others the design system's dark tone; the hairline keeps a dark card's
  // edge visible on the dark theme's background.
  otherCard: { backgroundColor: '#172D30', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  shrink: { flexShrink: 1 },
  cardName: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  cardCaption: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, fontWeight: '600' },
  cardAmount: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cardHolder: { flexShrink: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  badgeText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dotHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readyText: { flex: 1, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  readyTitle: { fontSize: 17, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 6, borderRadius: 16, borderWidth: 1, padding: 14, minHeight: 44 },
  tileTitle: { fontSize: 15, fontWeight: '700' },
});
