import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { BuyerWalletView } from '@/api/types';
import { AddWalletSheet } from '@/components/add-wallet-sheet';
import { Initials } from '@/components/buyer/initials';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWalletError } from '@/components/wallet-error';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    notMe: 'No soy yo',
    wallets: 'Mis billeteras',
    walletName: (code: string) => `Billetera ${code}`,
    paysOnTap: 'Paga cuando acercas el celular',
    noGrant: 'Falta darle permiso',
    ready: 'Lista para usar',
    activate: 'Activar',
    permission: 'Permiso',
    useThis: 'Usar para pagar',
    remove: 'Quitar',
    removeTitle: (name: string) => `¿Quitar ${name}?`,
    removeBody: 'Deja de ser una de tus billeteras. Sus movimientos se conservan.',
    cancel: 'Cancelar',
    add: 'Agregar billetera',
    limits: 'Mis límites',
    perPurchase: (amount: string) => `Hasta ${amount} por compra`,
    settings: 'Ajustes',
    settingsHint: 'Idioma, tema',
    help: 'Ayuda por WhatsApp',
    helpHint: 'Te respondemos en el día',
  },
  {
    notMe: 'Not me',
    wallets: 'My wallets',
    walletName: (code: string) => `${code} wallet`,
    paysOnTap: 'Pays when you tap your phone',
    noGrant: 'Needs your permission',
    ready: 'Ready to use',
    activate: 'Turn on',
    permission: 'Permission',
    useThis: 'Use to pay',
    remove: 'Remove',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeBody: 'It stops being one of your wallets. Its activity is kept.',
    cancel: 'Cancel',
    add: 'Add a wallet',
    limits: 'My limits',
    perPurchase: (amount: string) => `Up to ${amount} per purchase`,
    settings: 'Settings',
    settingsHint: 'Language, theme',
    help: 'Help on WhatsApp',
    helpHint: 'We answer the same day',
  },
);

// Inlined by Metro at bundle time; without it the help row stays hidden.
const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP;

// Who this phone is and its wallets (design: Cuenta y billeteras), with the way to the limits, the settings and help.
export default function AccountScreen() {
  const cards = useBuyerCards();
  const router = useRouter();
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const walletError = useWalletError();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runs one wallet write and words a failure under the cards.
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (wallet: BuyerWalletView) => wallet.publicName ?? t.walletName(wallet.assetCode);
  const confirmRemove = (wallet: BuyerWalletView) =>
    Alert.alert(t.removeTitle(nameOf(wallet)), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: () => run(() => cards.removeWallet(wallet)) },
    ]);

  const main = cards.defaultWallet;
  const rows = [
    {
      title: t.limits,
      subtitle: main ? t.perPurchase(formatMoney(main.perPaymentLimit, main.assetScale, main.assetCode, lang)) : '',
      onPress: () => router.push('/buyer/limits'),
    },
    { title: t.settings, subtitle: t.settingsHint, onPress: () => router.push('/settings') },
    ...(SUPPORT_WHATSAPP
      ? [{ title: t.help, subtitle: t.helpHint, onPress: () => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}`) }]
      : []),
  ];

  return (
    <Screen onRefresh={cards.reload}>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.buyer && (
        <>
          <View style={styles.header}>
            <Initials name={cards.buyer.name} size={60} background={theme.primaryTint} color={theme.primaryInk} />
            <View style={styles.grow}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {cards.buyer.name}
              </ThemedText>
              <TextLink label={t.notMe} color={theme.primaryInk} onPress={() => router.push('/buyer')} />
            </View>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.muted }]}>
              {t.wallets.toUpperCase()}
            </Text>
            {cards.wallets.map((wallet) => (
              <WalletCard
                key={wallet.id}
                wallet={wallet}
                name={nameOf(wallet)}
                busy={busy}
                canRemove={cards.wallets.length > 1}
                onUse={() => run(() => cards.setDefault(wallet))}
                onRemove={() => confirmRemove(wallet)}
              />
            ))}
            <View accessibilityLiveRegion="polite">{error && <StatusPill tone="bad" label={error} />}</View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdding(true)}
              style={({ pressed }) => [styles.add, { borderColor: theme.muted, opacity: pressed ? 0.7 : 1 }]}>
              <MaterialCommunityIcons name="plus" size={20} color={theme.text} />
              <ThemedText style={styles.strong}>{t.add}</ThemedText>
            </Pressable>
          </View>

          <ThemedView card style={styles.rows}>
            {rows.map((row, i) => (
              <Pressable
                key={row.title}
                accessibilityRole="button"
                onPress={row.onPress}
                style={({ pressed }) => [styles.menuRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={styles.grow}>
                  <ThemedText style={styles.strong}>{row.title}</ThemedText>
                  <ThemedText type="caption">{row.subtitle}</ThemedText>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
              </Pressable>
            ))}
          </ThemedView>
        </>
      )}
      <AddWalletSheet role="buyer" visible={adding} onClose={() => setAdding(false)} onAdd={cards.addWallet} />
    </Screen>
  );
}

type WalletCardProps = {
  wallet: BuyerWalletView;
  name: string;
  busy: boolean;
  canRemove: boolean;
  onUse: () => void;
  onRemove: () => void;
};

// One wallet: the default one pays on a tap, one without a grant needs the buyer's permission first.
function WalletCard({ wallet, name, busy, canRemove, onUse, onRemove }: WalletCardProps) {
  const router = useRouter();
  const theme = useTheme();
  const t = useCopy(copy);
  return (
    <ThemedView card style={[styles.wallet, wallet.isDefault && { borderColor: theme.primaryInk }]}>
      <View style={styles.walletHead}>
        <View style={[styles.walletIcon, { backgroundColor: wallet.isDefault ? theme.primaryInk : theme.idle }]} />
        <View style={styles.grow}>
          <ThemedText style={styles.strong} numberOfLines={1}>
            {name}
          </ThemedText>
          {!wallet.hasGrant ? (
            <Text style={[styles.note, { color: theme.accentInk }]}>{t.noGrant}</Text>
          ) : wallet.isDefault ? (
            <Text style={[styles.note, { color: theme.primaryInk }]}>{t.paysOnTap}</Text>
          ) : (
            <ThemedText type="caption">{t.ready}</ThemedText>
          )}
        </View>
        {!wallet.hasGrant && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.activate}: ${name}`}
            onPress={() => router.push({ pathname: '/buyer/grant', params: { walletId: wallet.id } })}
            style={({ pressed }) => [styles.activate, { backgroundColor: theme.primaryTint, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.activateText, { color: theme.primaryInk }]}>{t.activate}</Text>
          </Pressable>
        )}
      </View>
      {(wallet.hasGrant || !wallet.isDefault || canRemove) && (
        <View style={styles.actions}>
          {wallet.hasGrant && (
            <TextLink
              label={t.permission}
              color={theme.primaryInk}
              onPress={() => router.push({ pathname: '/buyer/grant', params: { walletId: wallet.id } })}
            />
          )}
          {!wallet.isDefault && <TextLink label={t.useThis} color={theme.primaryInk} disabled={busy} onPress={onUse} />}
          {canRemove && <TextLink label={t.remove} color={theme.outflow} disabled={busy} onPress={onRemove} />}
        </View>
      )}
    </ThemedView>
  );
}

type LinkProps = { label: string; color: string; disabled?: boolean; onPress: () => void };

function TextLink({ label, color, disabled = false, onPress }: LinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Text style={[styles.linkText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  strong: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  wallet: { gap: 8, borderWidth: 2 },
  walletHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletIcon: { width: 40, height: 28, borderRadius: 6 },
  activate: { minHeight: 40, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 14 },
  activateText: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 16 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  add: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16 },
  rows: { padding: 0, gap: 0 },
  menuRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
});
