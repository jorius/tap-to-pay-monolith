import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { apiUrl } from '@/api/client';
import type { BuyerView, VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { appRole, type AppRole } from '@/config/role';
import { Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useHealth } from '@/hooks/use-health';
import { useSession, type ThemeChoice } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    language: 'Idioma',
    langs: { es: 'Español', en: 'English' },
    langNote: 'La app abre en español aunque el teléfono esté en otro idioma. Tu elección se guarda en este teléfono.',
    theme: 'Tema',
    themes: { system: 'Como el teléfono', light: 'Claro', dark: 'Oscuro' },
    sound: 'Sonido',
    announce: 'Anunciar pagos en voz alta',
    thisPhone: 'Este teléfono',
    who: { vendor: 'Comercio', buyer: 'Comprador' },
    change: 'Cambiar',
    wallets: (n: number) => (n === 1 ? '1 billetera' : `${n} billeteras`),
    service: 'Servicio',
    apiUrl: 'URL de la API',
    connection: 'Conexión',
    checking: 'Verificando…',
    connected: (ms: number) => `Conectado · ${ms} ms`,
    unreachable: 'Sin conexión',
    debug: 'Depuración',
    showLabels: 'Mostrar etiquetas de depuración',
    openDebug: 'Abrir herramientas de depuración',
    roleLine: { vendor: 'Rol del build: Comercio', buyer: 'Rol del build: Billetera' },
    noRole: 'Build sin rol (desarrollo)',
    buildNote: 'El rol viene del build. Para usar el otro rol se instala el otro APK.',
  },
  {
    language: 'Language',
    langs: { es: 'Español', en: 'English' },
    langNote: 'The app opens in Spanish even when the phone uses another language. Your choice is kept on this phone.',
    theme: 'Theme',
    themes: { system: 'Same as the phone', light: 'Light', dark: 'Dark' },
    sound: 'Sound',
    announce: 'Announce payments out loud',
    thisPhone: 'This phone',
    who: { vendor: 'Vendor', buyer: 'Buyer' },
    change: 'Change',
    wallets: (n: number) => (n === 1 ? '1 wallet' : `${n} wallets`),
    service: 'Service',
    apiUrl: 'API URL',
    connection: 'Connection',
    checking: 'Checking…',
    connected: (ms: number) => `Connected · ${ms} ms`,
    unreachable: 'Disconnected',
    debug: 'Debugging',
    showLabels: 'Show debug labels',
    openDebug: 'Open debug tools',
    roleLine: { vendor: 'Build role: Vendor', buyer: 'Build role: Buyer' },
    noRole: 'Build without a role (development)',
    buildNote: 'The role comes from the build. To use the other role, install the other APK.',
  },
);

const LANGS: Lang[] = ['es', 'en'];
const THEMES: ThemeChoice[] = ['system', 'light', 'dark'];

// Ajustes of both builds, a stack screen in the design's list style: white groups of rows with chevrons.
export function SettingsScreen({ role }: { role: AppRole }) {
  const session = useSession();
  const theme = useTheme();
  const t = useCopy(copy);
  const health = useHealth();
  const router = useRouter();
  const vendors = useApi<VendorView[]>(role === 'vendor' ? '/vendors' : null);
  const buyer = useApi<BuyerView>(role === 'buyer' && session.buyerId ? `/buyers/${session.buyerId}` : null);
  const owner = role === 'vendor' ? vendors.data?.find((v) => v.id === session.vendorId) : buyer.data;
  // "Ana · 2 billeteras" (an older service without a wallets list has just the one).
  const phone = owner ? `${owner.name} · ${t.wallets(owner.wallets?.length ?? 1)}` : '—';
  const version = Constants.expoConfig?.version ?? '';
  const connection =
    health.status === 'connected'
      ? { label: t.connected(health.latencyMs), dot: Fills.income, ink: theme.income }
      : health.status === 'checking'
        ? { label: t.checking, dot: Fills.refused, ink: theme.muted }
        : { label: t.unreachable, dot: Fills.outflow, ink: theme.outflow };
  const toggle = (label: string, value: boolean, onChange: (value: boolean) => void) => (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ false: theme.idle, true: Fills.primary }}
      thumbColor="#FFFFFF"
    />
  );

  return (
    <Screen onRefresh={() => Promise.all([vendors.reload(), buyer.reload()])}>
      <Section title={t.language}>
        <Group label={t.language}>
          {LANGS.map((lang) => (
            <Row key={lang} label={t.langs[lang]} checked={session.lang === lang} onPress={() => session.update({ lang })} />
          ))}
        </Group>
        <ThemedText type="caption">{t.langNote}</ThemedText>
      </Section>

      <Section title={t.theme}>
        <Group label={t.theme}>
          {THEMES.map((value) => (
            <Row key={value} label={t.themes[value]} checked={session.theme === value} onPress={() => session.update({ theme: value })} />
          ))}
        </Group>
      </Section>

      {role === 'vendor' && (
        <Section title={t.sound}>
          <Group>
            <Row label={t.announce} right={toggle(t.announce, session.sound, (sound) => session.update({ sound }))} />
          </Group>
        </Section>
      )}

      <Section title={t.thisPhone}>
        <Group>
          {/* The phone opens as the first vendor or buyer the service lists; only here can it pick another. */}
          <Row
            detail={t.who[role]}
            label={phone}
            value={t.change}
            accessibilityLabel={`${t.change}: ${t.who[role]}`}
            onPress={() => router.push(role === 'vendor' ? '/vendor' : '/buyer')}
          />
        </Group>
      </Section>

      <Section title={t.service}>
        <Group>
          <Row detail={t.apiUrl} label={apiUrl} mono />
          <Row
            label={t.connection}
            right={
              <View style={styles.inline} accessibilityLiveRegion="polite">
                <View style={[styles.dot, { backgroundColor: connection.dot }]} />
                <Text style={[styles.connection, { color: connection.ink }]}>{connection.label}</Text>
              </View>
            }
          />
        </Group>
      </Section>

      <Section title={t.debug}>
        <Group>
          <Row label={t.showLabels} right={toggle(t.showLabels, session.debugLabels, (debugLabels) => session.update({ debugLabels }))} />
          <Row label={t.openDebug} onPress={() => router.push('/debug')} />
        </Group>
      </Section>

      <View style={[styles.build, { borderColor: theme.border }]}>
        <ThemedText style={styles.rowLabel}>{appRole ? t.roleLine[appRole] : t.noRole}</ThemedText>
        <ThemedText type="caption" style={styles.mono}>
          {appRole ? `EXPO_PUBLIC_APP_ROLE=${appRole} · v${version}` : `v${version}`}
        </ThemedText>
        <ThemedText type="caption">{t.buildNote}</ThemedText>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.muted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

// A white card of rows split by hairlines; with a label it is a radio group of checked rows.
function Group({ label, children }: { label?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole={label ? 'radiogroup' : undefined}
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {Children.toArray(children).map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

type RowProps = {
  label: string;
  // Small caption above the label ("Comercio" over "Ana · 2 billeteras").
  detail?: string;
  value?: string;
  mono?: boolean;
  right?: ReactNode;
  // A row that navigates ends in a chevron; a checked (or unchecked) one is a radio option with a check mark instead.
  checked?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

function Row({ label, detail, value, mono, right, checked, onPress, accessibilityLabel }: RowProps) {
  const theme = useTheme();
  const body = (
    <>
      <View style={styles.grow}>
        {detail && <ThemedText type="caption">{detail}</ThemedText>}
        <ThemedText selectable={!onPress} style={[styles.rowLabel, mono && styles.mono]}>
          {label}
        </ThemedText>
      </View>
      {value && <Text style={[styles.value, { color: theme.primaryInk }]}>{value}</Text>}
      {right}
      {checked !== undefined
        ? checked && <MaterialCommunityIcons name="check" size={22} color={theme.primaryInk} />
        : onPress && <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole={checked === undefined ? 'button' : 'radio'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  group: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 13, fontWeight: '400' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connection: { fontSize: 14, fontWeight: '600' },
  build: { gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
});
