import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiUrl } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fills } from '@/constants/theme';
import { useHealth } from '@/hooks/use-health';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

const copy = defineCopy(
  {
    connection: 'Conexión con el servicio',
    checking: 'Verificando…',
    connected: 'Conectado',
    unreachable: 'Sin conexión',
    firstCheck: (url: string) => `Primera consulta a ${url} en curso.`,
    network: (url: string) =>
      `No se puede conectar con el servicio en ${url}. Revisa la IP en .env y que el teléfono esté en la misma red.`,
    latency: 'Latencia',
    serviceWallet: 'Billetera del servicio',
    every: 'GET /health cada 5 s',
  },
  {
    connection: 'Service connection',
    checking: 'Checking…',
    connected: 'Connected',
    unreachable: 'Disconnected',
    firstCheck: (url: string) => `First request to ${url} in progress.`,
    network: (url: string) =>
      `Can't reach the service at ${url}. Check the IP in .env and that the phone is on the same network.`,
    latency: 'Latency',
    serviceWallet: 'Service wallet',
    every: 'GET /health every 5 s',
  },
);

// Full connection label (design: DebugTools, DebugStates), fed by the app-wide /health poller.
export function ConnectionLabel() {
  const health = useHealth();
  const theme = useTheme();
  const t = useCopy(copy);
  const state =
    health.status === 'connected'
      ? { title: t.connected, ink: theme.income, dot: Fills.income }
      : health.status === 'checking'
        ? { title: t.checking, ink: theme.muted, dot: Fills.refused }
        : { title: t.unreachable, ink: theme.outflow, dot: Fills.outflow };

  return (
    <ThemedView card>
      <Text accessibilityRole="header" style={[styles.section, { color: theme.muted }]}>
        {t.connection.toUpperCase()}
      </Text>
      <View accessibilityLiveRegion="polite" style={styles.status}>
        <View style={[styles.statusDot, { backgroundColor: state.dot }]} />
        <Text style={[styles.statusText, { color: state.ink }]}>{state.title}</Text>
      </View>
      <Row label="URL" value={apiUrl} />
      {health.status === 'connected' && (
        <>
          <Row label={t.latency} value={`${health.latencyMs} ms`} />
          <Row label={t.serviceWallet} value={health.clientWalletAddress} />
        </>
      )}
      {health.status === 'checking' && <ThemedText type="caption">{t.firstCheck(apiUrl)}</ThemedText>}
      {health.status === 'unreachable' && (
        <ThemedText type="caption" style={{ color: theme.outflow }}>
          {health.code === 'NETWORK' ? t.network(apiUrl) : `${health.code}: ${health.message}`}
        </ThemedText>
      )}
      <ThemedText type="caption">{t.every}</ThemedText>
    </ThemedView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="caption">{label}</ThemedText>
      <ThemedText selectable style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

const DOT_COLORS = { checking: Fills.refused, connected: Fills.income, unreachable: Fills.outflow } as const;

// Compact pill for every header, so the connection state is always visible; it opens /debug (design header).
export function ConnectionDot() {
  const { status } = useHealth();
  const theme = useTheme();
  const t = useCopy(commonCopy);
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.api[status]}
      onPress={() => router.push('/debug')}
      style={({ pressed }) => [styles.pill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.circle, { backgroundColor: DOT_COLORS[status] }]} />
      <Text style={[styles.api, { color: theme.text }]}>API</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  value: { flex: 1, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
  },
  circle: { width: 8, height: 8, borderRadius: 4 },
  api: { fontSize: 13, fontWeight: '700' },
});
