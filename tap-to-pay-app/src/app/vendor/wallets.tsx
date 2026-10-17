import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { VendorView, VendorWalletView } from '@/api/types';
import { AddWalletSheet } from '@/components/add-wallet-sheet';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { currencyName, fill, providerName, walletSite } from '@/components/vendor/format';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { defaultFirst, vendorWalletActions, vendorWallets, walletName } from '@/components/vendor/wallets';
import { useWalletError } from '@/components/wallet-error';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    intro: 'Tus ventas nuevas llegan a la billetera marcada.',
    receivingHere: 'Aquí llegan tus ventas',
    seeBalance: 'Ver saldo',
    receiveHere: 'Recibir aquí',
    remove: 'Quitar',
    removeTitle: '¿Quitar {name}?',
    removeBody: 'Deja de recibir ventas. Sus ventas anteriores siguen en tu historial; una venta que aún espera el toque fallará.',
    cancel: 'Cancelar',
    add: 'Agregar otra billetera',
    keys: 'Este celular nunca guarda tus claves.',
  },
  {
    intro: 'Your new sales land in the marked wallet.',
    receivingHere: 'Your sales land here',
    seeBalance: 'See balance',
    receiveHere: 'Receive here',
    remove: 'Remove',
    removeTitle: 'Remove {name}?',
    removeBody: 'It stops receiving sales. Its earlier sales stay in your history; a sale still waiting for a tap will fail.',
    cancel: 'Cancel',
    add: 'Add another wallet',
    keys: 'This phone never keeps your keys.',
  },
);

export default function VendorWalletsScreen() {
  return (
    <VendorGate>{(vendor, replace, reload) => <Wallets vendor={vendor} replace={replace} reload={reload} />}</VendorGate>
  );
}

type WalletsProps = { vendor: VendorView; replace: (next: VendorView) => void; reload: () => Promise<void> };

// Dónde recibo la plata (design): one card per receiving wallet; the marked one takes new sales, the others can take
// over or leave.
function Wallets({ vendor, replace, reload }: WalletsProps) {
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const theme = useTheme();
  const walletError = useWalletError();
  const wallets = vendorWallets(vendor);
  const actions = vendorWalletActions(vendor, replace);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const confirmRemove = (wallet: VendorWalletView) =>
    Alert.alert(fill(t.removeTitle, { name: walletName(wallet, v.walletNamed) }), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: () => run(() => actions.removeWallet(wallet)) },
    ]);

  return (
    <Screen onRefresh={reload}>
      <ThemedText style={{ color: theme.muted }}>{t.intro}</ThemedText>
      {defaultFirst(wallets).map((wallet) => (
        <WalletCard
          key={wallet.id}
          wallet={wallet}
          busy={busy}
          onMakeDefault={() => run(() => actions.setDefault(wallet))}
          onRemove={() => confirmRemove(wallet)}
        />
      ))}
      <View accessibilityLiveRegion="polite">{error && <StatusPill tone="bad" label={error} />}</View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setAdding(true)}
        style={({ pressed }) => [styles.add, { borderColor: theme.muted, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialCommunityIcons name="plus" size={20} color={theme.text} />
        <Text style={[styles.addText, { color: theme.text }]}>{t.add}</Text>
      </Pressable>
      <View style={styles.foot}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={theme.muted} />
        <ThemedText type="caption">{t.keys}</ThemedText>
      </View>
      <AddWalletSheet role="vendor" visible={adding} onClose={() => setAdding(false)} onAdd={actions.addWallet} />
    </Screen>
  );
}

type CardProps = { wallet: VendorWalletView; busy: boolean; onMakeDefault: () => void; onRemove: () => void };

// The radio is decorative: the words under it say which wallet receives. Only a non-receiving wallet can leave, so the
// vendor always keeps one.
function WalletCard({ wallet, busy, onMakeDefault, onRemove }: CardProps) {
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const lang = useLang();
  const theme = useTheme();
  const on = wallet.isDefault;
  return (
    <ThemedView card style={on && { borderColor: theme.primaryInk, borderWidth: 2 }}>
      <View style={styles.head}>
        <View style={[styles.radio, { borderColor: on ? theme.primaryInk : theme.muted }]}>
          {on && <View style={[styles.radioDot, { backgroundColor: theme.primaryInk }]} />}
        </View>
        <View style={styles.grow}>
          <Text style={[styles.title, { color: theme.text }]}>{walletName(wallet, v.walletNamed)}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {currencyName(wallet.assetCode, lang)} · {providerName(wallet.walletAddress)}
          </Text>
        </View>
      </View>
      {on ? (
        <View style={styles.actions}>
          <View style={[styles.inline, styles.grow]}>
            <View style={[styles.dot, { backgroundColor: theme.income }]} />
            <Text style={[styles.here, { color: theme.income }]}>{t.receivingHere}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(walletSite(wallet.walletAddress))}
            style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.linkText, { color: theme.primaryInk }]}>{t.seeBalance}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onMakeDefault}
            style={({ pressed }) => [styles.button, styles.grow, { backgroundColor: theme.primaryTint, opacity: busy ? 0.4 : pressed ? 0.7 : 1 }]}>
            <Text style={[styles.buttonText, { color: theme.primaryInk }]}>{t.receiveHere}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onRemove}
            style={({ pressed }) => [styles.button, { borderWidth: 1, borderColor: theme.border, opacity: busy ? 0.4 : pressed ? 0.7 : 1 }]}>
            <Text style={[styles.buttonText, { color: theme.outflow }]}>{t.remove}</Text>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  grow: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  here: { fontSize: 14, fontWeight: '600' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  add: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16 },
  addText: { fontSize: 16, fontWeight: '600' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
