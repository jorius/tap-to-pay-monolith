import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { DebugWallet, DebugWallets } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Fill } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    wallets: 'Billeteras de la Test Wallet',
    dbOk: 'Base de datos: ok',
    dbError: 'Base de datos: error',
    missing: 'Servicio sin /debug/wallets: respondió 404 NOT_FOUND, corre una versión sin el endpoint de depuración.',
    checkedAt: (time: string) => `Revisado a las ${time}`,
    refresh: 'Actualizar',
    role: { client: 'SERVICIO', buyer: 'COMPRADOR', vendor: 'COMERCIO' },
    reachable: 'alcanzable ✓',
    unreachable: 'no alcanzable ✕',
    granted: 'grant ✓',
    noGrant: 'sin grant',
  },
  {
    wallets: 'Test Wallet wallets',
    dbOk: 'Database: ok',
    dbError: 'Database: error',
    missing: 'Service without /debug/wallets: it answered 404 NOT_FOUND, so it runs a version without the debug endpoint.',
    checkedAt: (time: string) => `Checked at ${time}`,
    refresh: 'Refresh',
    role: { client: 'SERVICE', buyer: 'BUYER', vendor: 'VENDOR' },
    reachable: 'reachable ✓',
    unreachable: 'unreachable ✕',
    granted: 'grant ✓',
    noGrant: 'no grant',
  },
);

// Role badges in the 700 tones, so the white text keeps AA contrast.
const BADGE = { client: Fill.service, buyer: Fill.buyer, vendor: Fill.vendor } as const;

// The service's live view of the Test Wallet addresses it knows (GET /debug/wallets; design: DebugTools, DebugStates).
export function WalletsPanel() {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const { data, error, loading, reload } = useApi<DebugWallets>('/debug/wallets');

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={styles.title}>
          {t.wallets}
        </ThemedText>
        {data && <StatusPill tone={data.database === 'ok' ? 'ok' : 'bad'} label={data.database === 'ok' ? t.dbOk : t.dbError} />}
      </View>
      {loading && !data && <ActivityIndicator color={theme.muted} />}
      {error && <StatusPill tone={error.status === 404 ? 'wait' : 'bad'} label={error.status === 404 ? t.missing : error.message} />}
      {data?.wallets.map((wallet) => (
        <WalletRow key={`${wallet.role}:${wallet.walletAddress}`} wallet={wallet} />
      ))}
      <View style={styles.footer}>
        <ThemedText type="caption" style={styles.grow}>
          {data
            ? t.checkedAt(new Date(data.checkedAt).toLocaleTimeString(lang === 'es' ? 'es-CO' : 'en-US'))
            : ''}
        </ThemedText>
        <BigButton label={t.refresh} color={Fill.service} onPress={reload} />
      </View>
    </View>
  );
}

function WalletRow({ wallet }: { wallet: DebugWallet }) {
  const theme = useTheme();
  const t = useCopy(copy);
  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={styles.rowHead}>
        <View style={[styles.badge, { backgroundColor: BADGE[wallet.role] }]}>
          <Text style={styles.badgeText}>{t.role[wallet.role]}</Text>
        </View>
        <ThemedText numberOfLines={1} style={[styles.grow, styles.name]}>
          {wallet.name}
        </ThemedText>
        <ThemedText style={styles.asset}>
          {wallet.assetCode === null ? '—' : `${wallet.assetCode} · ${wallet.assetScale}`}
        </ThemedText>
      </View>
      <ThemedText type="caption" selectable style={styles.mono}>
        {wallet.walletAddress}
      </ThemedText>
      <View style={styles.chips}>
        <StatusPill tone={wallet.reachable ? 'ok' : 'bad'} label={wallet.reachable ? t.reachable : t.unreachable} />
        {wallet.hasGrant !== null && (
          <StatusPill tone={wallet.hasGrant ? 'ok' : 'neutral'} label={wallet.hasGrant ? t.granted : t.noGrant} />
        )}
      </View>
      {wallet.error !== null && <Text style={[styles.error, { color: theme.badInk }]}>{wallet.error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 17, fontWeight: '800' },
  row: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, minHeight: 22, justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  name: { fontSize: 16, fontWeight: '700' },
  asset: { fontSize: 13, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 11.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
});
