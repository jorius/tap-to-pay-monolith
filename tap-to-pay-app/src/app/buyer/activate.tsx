import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BuyerWalletView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fills } from '@/constants/theme';
import { cardBlocker, currencyName, useBuyerCards } from '@/hooks/use-buyer-cards';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

const copy = defineCopy(
  {
    missing: (n: number) => (n === 0 ? 'Todo listo' : n === 1 ? 'Te falta 1 paso' : `Te faltan ${n} pasos`),
    title: 'Activa tu celular para pagar',
    progress: (done: number) => `${done} de 3 pasos listos`,
    stepN: (n: number) => `Paso ${n}, pendiente`,
    stepDone: 'Listo',
    phone: 'Tu celular sirve para pagar',
    phoneOk: 'Tiene NFC y está prendido',
    phoneBlockers: {
      module: 'Este build no trae el módulo NFC.',
      nfc: 'Este celular no tiene NFC, así que no puede pagar acercándolo.',
      nfcOff: 'Prende el NFC en los ajustes del celular.',
      hce: 'Este celular no puede actuar como tarjeta (sin HCE).',
    },
    openNfc: 'Abrir ajustes de NFC',
    wallet: 'Billetera agregada',
    myWallet: 'Mi billetera',
    noWallet: 'Agrega una billetera en Cuenta.',
    permission: 'Dale permiso a esta app',
    permissionHow: 'Se hace una sola vez, en la página de tu billetera.',
    permissionOk: 'Ya diste el permiso.',
    givePermission: 'Dar permiso en mi billetera ↗',
    use: 'Usar este celular para pagar',
    footer: 'Después pondrás tus límites. Nunca se cobra más de lo que tú permitas.',
    otherWallet: 'Usar otra billetera',
  },
  {
    missing: (n: number) => (n === 0 ? 'All set' : n === 1 ? '1 step to go' : `${n} steps to go`),
    title: 'Set up your phone to pay',
    progress: (done: number) => `${done} of 3 steps done`,
    stepN: (n: number) => `Step ${n}, pending`,
    stepDone: 'Done',
    phone: 'Your phone can pay',
    phoneOk: 'It has NFC and it is on',
    phoneBlockers: {
      module: 'This build does not include the NFC module.',
      nfc: 'This phone has no NFC, so it cannot pay by tapping.',
      nfcOff: "Turn NFC on in the phone's settings.",
      hce: 'This phone cannot act as a card (no HCE).',
    },
    openNfc: 'Open NFC settings',
    wallet: 'Wallet added',
    myWallet: 'My wallet',
    noWallet: 'Add a wallet in Account.',
    permission: 'Give this app permission',
    permissionHow: "It is done once, on your wallet's page.",
    permissionOk: 'Permission given.',
    givePermission: 'Give permission in my wallet ↗',
    use: 'Use this phone to pay',
    footer: "You'll set your limits next. You're never charged more than you allow.",
    otherWallet: 'Use another wallet',
  },
);

// The three things a phone needs before it pays (design: Activar pagos): NFC on and HCE, a wallet, and that wallet's
// permission. When all three hold, one button stores the default wallet as the card and returns home.
export default function ActivateScreen() {
  const cards = useBuyerCards();
  return (
    <Screen onRefresh={cards.reload}>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.buyer && <Checklist wallet={cards.defaultWallet} />}
    </Screen>
  );
}

function Checklist({ wallet }: { wallet: BuyerWalletView | null }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const router = useRouter();
  const [blocker, setBlocker] = useState(() => cardBlocker(wallet));
  // NFC can be turned on in the phone's settings meanwhile, so the checks re-run when the app comes back in front.
  useFocusEffect(
    useCallback(() => {
      const check = () => setBlocker(cardBlocker(wallet));
      check();
      const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
      return () => sub.remove();
    }, [wallet]),
  );

  const phoneOk = blocker === null || blocker === 'grant';
  const walletOk = wallet !== null;
  const grantOk = wallet?.hasGrant ?? false;
  const done = [phoneOk, walletOk, grantOk].filter(Boolean).length;
  const current = !phoneOk ? 1 : !walletOk ? 2 : 3;

  const useThisPhone = () => {
    if (wallet) NfcTap?.setCardPayload(wallet.walletAddress);
    if (router.canGoBack()) router.back();
    else router.replace('/buyer/card');
  };

  return (
    <>
      <View style={styles.head}>
        <Text style={[styles.missing, { color: theme.primaryInk }]}>{t.missing(3 - done)}</Text>
        <ThemedText type="title" accessibilityRole="header">
          {t.title}
        </ThemedText>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t.progress(done)}
          accessibilityValue={{ min: 0, max: 3, now: done }}
          style={[styles.track, { backgroundColor: theme.idle }]}>
          <View style={[styles.fill, { width: `${(done / 3) * 100}%` }]} />
        </View>
      </View>

      <Step n={1} done={phoneOk} current={current === 1} title={t.phone} body={phoneOk || !blocker ? t.phoneOk : t.phoneBlockers[blocker]}>
        {blocker === 'nfcOff' && (
          <BigButton
            label={t.openNfc}
            color={theme.primaryInk}
            ghost
            onPress={() => Linking.sendIntent('android.settings.NFC_SETTINGS').catch(() => Linking.openSettings())}
          />
        )}
      </Step>
      <Step
        n={2}
        done={walletOk}
        current={current === 2}
        title={t.wallet}
        body={wallet ? `${wallet.publicName ?? t.myWallet} · ${currencyName(wallet.assetCode, lang)}` : t.noWallet}
      />
      <Step n={3} done={grantOk} current={current === 3 && !grantOk} title={t.permission} body={grantOk ? t.permissionOk : t.permissionHow}>
        {wallet && !grantOk && (
          <BigButton
            label={t.givePermission}
            color={Fills.primary}
            onPress={() => router.push({ pathname: '/buyer/grant', params: { walletId: wallet.id } })}
          />
        )}
      </Step>

      {done === 3 && <BigButton label={t.use} color={Fills.primary} onPress={useThisPhone} />}

      <View style={styles.footer}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={theme.muted} />
        <ThemedText type="caption" style={styles.footerText}>
          {t.footer}
        </ThemedText>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/buyer/account')} style={styles.link} hitSlop={8}>
        <Text style={[styles.linkText, { color: theme.primaryInk }]}>{t.otherWallet}</Text>
      </Pressable>
    </>
  );
}

type StepProps = { n: number; done: boolean; current: boolean; title: string; body: string; children?: ReactNode };

// One checklist card: a green check once done, else its number; the step to do next wears a teal border.
function Step({ n, done, current, title, body, children }: StepProps) {
  const theme = useTheme();
  const t = useCopy(copy);
  return (
    <ThemedView card style={current && { borderColor: theme.primaryInk, borderWidth: 2 }}>
      <View style={styles.stepRow}>
        <View
          accessibilityLabel={done ? t.stepDone : t.stepN(n)}
          style={[styles.circle, done ? { backgroundColor: Fills.income } : { borderWidth: 2, borderColor: theme.primaryInk }]}>
          {done ? (
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
          ) : (
            <Text style={[styles.circleText, { color: theme.primaryInk }]}>{n}</Text>
          )}
        </View>
        <View style={styles.stepText}>
          <ThemedText style={styles.stepTitle}>{title}</ThemedText>
          <ThemedText type="caption">{body}</ThemedText>
        </View>
      </View>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8 },
  missing: { fontSize: 14, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, borderRadius: 4, backgroundColor: Fills.primary },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  circleText: { fontSize: 15, fontWeight: '700' },
  stepText: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  footerText: { flex: 1 },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
});
