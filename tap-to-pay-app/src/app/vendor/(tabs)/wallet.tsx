import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DebugWallet, DebugWallets, VendorView, VendorWalletView } from '@/api/types';
import { AddWalletSheet } from '@/components/add-wallet-sheet';
import { BigButton } from '@/components/big-button';
import { Chip } from '@/components/buyer/chip';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { addressPath, fill, providerName, walletSite } from '@/components/vendor/format';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { defaultFirst, vendorWalletActions, vendorWallets } from '@/components/vendor/wallets';
import { useWalletError } from '@/components/wallet-error';
import { Fill, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    intro: 'Las ventas nuevas llegan a tu billetera de cobro. Una venta ya creada sigue en la billetera que tenía al crearse.',
    receiving: 'Billetera de cobro',
    copyHint: 'Mantén presionada la dirección para copiarla.',
    provider: 'Proveedor',
    asset: 'Moneda',
    assetValue: '{code} · escala {scale} ({scale} decimales)',
    status: 'Estado',
    reachable: 'alcanzable',
    unreachable: 'no alcanzable',
    unknown: 'sin verificar',
    makeDefault: 'Establecer como billetera de cobro',
    remove: 'Quitar',
    onlyOne: 'Es tu única billetera de cobro: agrega otra antes de quitarla.',
    removeTitle: (path: string) => `¿Quitar la billetera ${path}?`,
    removeBody: 'Deja de recibir ventas. Sus ventas anteriores siguen en el servicio; una venta que aún espera el toque fallará.',
    cancel: 'Cancelar',
    add: 'Agregar billetera',
    keys: 'El servicio firma cada llamada a la billetera; este teléfono nunca guarda llaves ni tokens.',
    seeBalance: 'Ver saldo en tu billetera de cobro',
  },
  {
    intro: 'New sales land in your receiving wallet. A sale already created stays in the wallet it had when it was created.',
    receiving: 'Receiving wallet',
    copyHint: 'Long-press the address to copy it.',
    provider: 'Provider',
    asset: 'Currency',
    assetValue: '{code} · scale {scale} ({scale} decimals)',
    status: 'Status',
    reachable: 'reachable',
    unreachable: 'unreachable',
    unknown: 'not checked',
    makeDefault: 'Set as receiving wallet',
    remove: 'Remove',
    onlyOne: 'It is your only receiving wallet: add another one before removing it.',
    removeTitle: (path: string) => `Remove the ${path} wallet?`,
    removeBody: 'It stops receiving sales. Its earlier sales stay in the service; a sale still waiting for a tap will fail.',
    cancel: 'Cancel',
    add: 'Add a wallet',
    keys: 'The service signs every wallet call; this phone never holds keys or tokens.',
    seeBalance: 'See balance in your receiving wallet',
  },
);

export default function WalletScreen() {
  return (
    <VendorGate>{(vendor, replace, reload) => <Wallets vendor={vendor} replace={replace} reload={reload} />}</VendorGate>
  );
}

// The vendor's receiving wallets (design: Billetera y moneda): the default one receives new sales; others can be added,
// made default or removed.
type WalletsProps = { vendor: VendorView; replace: (next: VendorView) => void; reload: () => Promise<void> };

function Wallets({ vendor, replace, reload }: WalletsProps) {
  const t = useCopy(copy);
  const theme = useTheme();
  const { ink } = roleColors(theme, 'vendor');
  const walletError = useWalletError();
  const wallets = vendorWallets(vendor);
  const actions = vendorWalletActions(vendor, replace);
  const receiving = wallets.find((w) => w.isDefault) ?? wallets[0];
  const debug = useApi<DebugWallets>('/debug/wallets');
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
    Alert.alert(t.removeTitle(addressPath(wallet.walletAddress)), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: () => run(() => actions.removeWallet(wallet)) },
    ]);

  return (
    <Screen onRefresh={() => Promise.all([reload(), debug.reload()])}>
      <ThemedText style={{ color: theme.muted }}>{t.intro}</ThemedText>
      {defaultFirst(wallets).map((wallet) => (
        <ReceivingWallet
          key={wallet.id}
          wallet={wallet}
          live={debug.data?.wallets.find((w) => w.role === 'vendor' && w.walletAddress === wallet.walletAddress)}
          busy={busy}
          canRemove={wallets.length > 1}
          onMakeDefault={() => run(() => actions.setDefault(wallet))}
          onRemove={() => confirmRemove(wallet)}
        />
      ))}
      {wallets.length === 1 && <ThemedText type="caption">{t.onlyOne}</ThemedText>}
      <View accessibilityLiveRegion="polite">{error && <StatusPill tone="bad" label={error} />}</View>
      <BigButton label={t.add} color={ink} ghost onPress={() => setAdding(true)} />
      <ThemedText type="caption">{t.keys}</ThemedText>

      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(walletSite(receiving.walletAddress))}
        style={({ pressed }) => [styles.outline, { borderColor: ink, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.outlineText, { color: ink }]}>{t.seeBalance}</Text>
        <MaterialCommunityIcons name="open-in-new" size={16} color={ink} />
      </Pressable>

      <AddWalletSheet role="vendor" visible={adding} onClose={() => setAdding(false)} onAdd={actions.addWallet} />
    </Screen>
  );
}

type ReceivingWalletProps = {
  wallet: VendorWalletView;
  live: DebugWallet | undefined;
  busy: boolean;
  canRemove: boolean;
  onMakeDefault: () => void;
  onRemove: () => void;
};

function ReceivingWallet({ wallet, live, busy, canRemove, onMakeDefault, onRemove }: ReceivingWalletProps) {
  const t = useCopy(copy);
  const theme = useTheme();
  const { ink } = roleColors(theme, 'vendor');
  return (
    <ThemedView card style={wallet.isDefault ? { borderWidth: 2, borderColor: ink } : undefined}>
      <View style={styles.head}>
        <Text style={[styles.code, { color: theme.text }]}>{wallet.assetCode}</Text>
        {wallet.isDefault && <Chip label={t.receiving} fill={Fill.vendor} />}
      </View>
      <Text selectable style={[styles.address, { color: theme.text }]}>
        {wallet.walletAddress}
      </Text>
      <ThemedText type="caption">{t.copyHint}</ThemedText>
      <Row label={t.provider} value={providerName(wallet.walletAddress)} />
      <Row label={t.asset} value={fill(t.assetValue, { code: wallet.assetCode, scale: String(wallet.assetScale) })} strong />
      <View style={styles.row}>
        <ThemedText type="caption">{t.status}</ThemedText>
        <StatusPill
          tone={live ? (live.reachable ? 'ok' : 'bad') : 'neutral'}
          label={live ? (live.reachable ? t.reachable : t.unreachable) : t.unknown}
        />
      </View>
      {live?.error ? <Text style={[styles.error, { color: theme.badInk }]}>{live.error}</Text> : null}
      {!wallet.isDefault && <BigButton label={t.makeDefault} color={Fill.vendor} disabled={busy} onPress={onMakeDefault} />}
      <BigButton label={t.remove} color={theme.badInk} ghost disabled={busy || !canRemove} onPress={onRemove} />
    </ThemedView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="caption">{label}</ThemedText>
      <Text style={[styles.value, { color: theme.text }, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  address: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  value: { flexShrink: 1, textAlign: 'right', fontSize: 14 },
  strong: { fontWeight: '700' },
  error: { fontSize: 13 },
  outline: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: 14 },
  outlineText: { fontSize: 16, fontWeight: '800' },
  code: { fontSize: 18, fontWeight: '800' },
});
