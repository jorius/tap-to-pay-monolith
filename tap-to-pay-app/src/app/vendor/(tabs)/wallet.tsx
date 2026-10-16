import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BuyerView, DebugWallets, VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fill, providerName, walletSite } from '@/components/vendor/format';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { Fill, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    receiving: 'Billetera de cobro',
    copyHint: 'Mantén presionada la dirección para copiarla.',
    provider: 'Proveedor',
    asset: 'Moneda',
    assetValue: '{code} · escala {scale} ({scale} decimales)',
    status: 'Estado',
    reachable: 'alcanzable',
    unreachable: 'no alcanzable',
    unknown: 'sin verificar',
    keys: 'El servicio firma cada llamada a la billetera; este teléfono nunca guarda llaves ni tokens.',
    seeBalance: 'Ver saldo en tu billetera',
    currencies: 'Disponibilidad de monedas',
    chargesIn: 'Cobras en {code}.',
    accepted: 'Aceptada',
    unavailable: 'No disponible',
    mismatch:
      'Un comprador con billetera en {other} verá «No disponible: el comercio cobra en {code}». En esta versión no hay conversión entre monedas (regla ASSET_MISMATCH).',
    allSame: 'Todos los compradores registrados pagan en {code}.',
    switchTitle: 'Cambiar billetera de cobro',
    active: 'activa',
    use: 'Usar esta billetera',
    switchNote:
      'Por ahora cada comercio tiene una sola billetera de cobro: elegir otra necesita varias billeteras por comercio en el servicio.',
  },
  {
    receiving: 'Receiving wallet',
    copyHint: 'Long-press the address to copy it.',
    provider: 'Provider',
    asset: 'Currency',
    assetValue: '{code} · scale {scale} ({scale} decimals)',
    status: 'Status',
    reachable: 'reachable',
    unreachable: 'unreachable',
    unknown: 'not checked',
    keys: 'The service signs every wallet call; this phone never holds keys or tokens.',
    seeBalance: 'See balance in your wallet',
    currencies: 'Currency availability',
    chargesIn: 'You charge in {code}.',
    accepted: 'Accepted',
    unavailable: 'Not available',
    mismatch:
      'A buyer with a {other} wallet sees “Not available: the vendor charges in {code}”. This version has no currency conversion (ASSET_MISMATCH rule).',
    allSame: 'Every registered buyer pays in {code}.',
    switchTitle: 'Change receiving wallet',
    active: 'active',
    use: 'Use this wallet',
    switchNote: 'For now each vendor has a single receiving wallet: choosing another needs several wallets per vendor in the service.',
  },
);

export default function WalletScreen() {
  return <VendorGate>{(vendor) => <Wallet vendor={vendor} />}</VendorGate>;
}

// The receiving wallet and which buyer currencies it can charge (design: Billetera y moneda, Disponibilidad de monedas).
function Wallet({ vendor }: { vendor: VendorView }) {
  const t = useCopy(copy);
  const theme = useTheme();
  const { ink } = roleColors(theme, 'vendor');
  const debug = useApi<DebugWallets>('/debug/wallets');
  const buyers = useApi<BuyerView[]>('/buyers');
  const live = debug.data?.wallets.find((w) => w.role === 'vendor' && w.walletAddress === vendor.walletAddress);
  const codes = [...new Set([vendor.assetCode, ...(buyers.data ?? []).map((b) => b.assetCode)])];
  const other = codes.find((code) => code !== vendor.assetCode);

  return (
    <Screen>
      <ThemedView card>
        <Text style={[styles.h3, { color: theme.muted }]}>{t.receiving}</Text>
        <Text selectable style={[styles.address, { color: theme.text }]}>
          {vendor.walletAddress}
        </Text>
        <ThemedText type="caption">{t.copyHint}</ThemedText>
        <Row label={t.provider} value={providerName(vendor.walletAddress)} />
        <Row label={t.asset} value={fill(t.assetValue, { code: vendor.assetCode, scale: String(vendor.assetScale) })} strong />
        <View style={styles.row}>
          <ThemedText type="caption">{t.status}</ThemedText>
          <StatusPill
            tone={live ? (live.reachable ? 'ok' : 'bad') : 'neutral'}
            label={live ? (live.reachable ? t.reachable : t.unreachable) : t.unknown}
          />
        </View>
        {live?.error ? <Text style={[styles.error, { color: theme.badInk }]}>{live.error}</Text> : null}
        <ThemedText type="caption">{t.keys}</ThemedText>
      </ThemedView>

      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(walletSite(vendor.walletAddress))}
        style={({ pressed }) => [styles.outline, { borderColor: ink, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.outlineText, { color: ink }]}>{t.seeBalance}</Text>
        <MaterialCommunityIcons name="open-in-new" size={16} color={ink} />
      </Pressable>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
          {t.currencies}
        </Text>
        <ThemedText>{fill(t.chargesIn, { code: vendor.assetCode })}</ThemedText>
        {codes.map((code) => (
          <View key={code} style={[styles.currency, { borderColor: theme.border }]}>
            <Text style={[styles.code, { color: theme.text }]}>{code}</Text>
            <StatusPill
              tone={code === vendor.assetCode ? 'ok' : 'neutral'}
              label={code === vendor.assetCode ? t.accepted : t.unavailable}
            />
          </View>
        ))}
        <ThemedText type="caption">
          {other ? fill(t.mismatch, { other, code: vendor.assetCode }) : fill(t.allSame, { code: vendor.assetCode })}
        </ThemedText>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
          {t.switchTitle}
        </Text>
        <View
          accessibilityRole="radio"
          accessibilityState={{ checked: true, disabled: true }}
          style={[styles.option, { borderColor: ink }]}>
          <View style={[styles.radio, { borderColor: ink }]}>
            <View style={[styles.radioDot, { backgroundColor: ink }]} />
          </View>
          <View style={styles.grow}>
            <Text style={[styles.optionTitle, { color: theme.text }]}>
              {vendor.assetCode} · {t.active}
            </Text>
            <Text numberOfLines={1} style={[styles.mono, { color: theme.muted }]}>
              {vendor.walletAddress}
            </Text>
          </View>
        </View>
        <BigButton label={t.use} color={Fill.vendor} disabled onPress={() => {}} />
        <ThemedText type="caption">{t.switchNote}</ThemedText>
      </View>
    </Screen>
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
  h2: { fontSize: 17, fontWeight: '800' },
  h3: { fontSize: 14, fontWeight: '700' },
  address: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  value: { flexShrink: 1, textAlign: 'right', fontSize: 14 },
  strong: { fontWeight: '700' },
  error: { fontSize: 13 },
  outline: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: 14 },
  outlineText: { fontSize: 16, fontWeight: '800' },
  section: { gap: 10 },
  currency: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14 },
  code: { fontSize: 16, fontWeight: '800' },
  option: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderRadius: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  grow: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 15, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
});
