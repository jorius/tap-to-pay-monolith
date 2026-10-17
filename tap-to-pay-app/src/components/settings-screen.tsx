import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { apiUrl } from '@/api/client';
import type { BuyerView, VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { appRole, type AppRole } from '@/config/role';
import { Brand, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useHealth } from '@/hooks/use-health';
import { useSession, type ThemeChoice } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    language: 'Idioma',
    spanish: 'Español (predeterminado)',
    langNote: 'La app abre en español aunque el teléfono esté en otro idioma. Tu elección se guarda en este teléfono.',
    theme: 'Tema',
    themes: { system: 'Como el teléfono (predeterminado)', light: 'Claro', dark: 'Oscuro' },
    thisPhone: 'Este teléfono',
    who: { vendor: 'Comercio', buyer: 'Comprador' },
    change: 'Cambiar',
    wallets: (n: number) => (n === 1 ? '1 billetera' : `${n} billeteras`),
    manage: 'Administrar',
    service: 'Servicio',
    apiUrl: 'URL de la API',
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
    spanish: 'Español (default)',
    langNote: 'The app opens in Spanish even when the phone uses another language. Your choice is kept on this phone.',
    theme: 'Theme',
    themes: { system: 'Same as the phone (default)', light: 'Light', dark: 'Dark' },
    thisPhone: 'This phone',
    who: { vendor: 'Vendor', buyer: 'Buyer' },
    change: 'Change',
    wallets: (n: number) => (n === 1 ? '1 wallet' : `${n} wallets`),
    manage: 'Manage',
    service: 'Service',
    apiUrl: 'API URL',
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

const LANGS: { lang: Lang; label: (t: (typeof copy)['es']) => string }[] = [
  { lang: 'es', label: (t) => t.spanish },
  { lang: 'en', label: () => 'English' },
];

const THEMES: ThemeChoice[] = ['system', 'light', 'dark'];

// Settings of both builds (design: Settings); the role picks colours and which identity "Este teléfono" shows.
export function SettingsScreen({ role }: { role: AppRole }) {
  const session = useSession();
  const theme = useTheme();
  const colors = roleColors(theme, role);
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
      ? { label: t.connected(health.latencyMs), dot: Brand.ok, ink: theme.okInk }
      : health.status === 'checking'
        ? { label: t.checking, dot: Brand.postgres, ink: theme.muted }
        : { label: t.unreachable, dot: Brand.bad, ink: theme.badInk };

  return (
    <Screen onRefresh={() => Promise.all([vendors.reload(), buyer.reload()])}>
      <Section title={t.language}>
        <Choices
          label={t.language}
          options={LANGS.map(({ lang, label }) => ({ value: lang, label: label(t) }))}
          value={session.lang}
          onChange={(lang) => session.update({ lang })}
          ink={colors.ink}
        />
        <ThemedText type="caption">{t.langNote}</ThemedText>
      </Section>

      <Section title={t.theme}>
        <Choices
          label={t.theme}
          options={THEMES.map((value) => ({ value, label: t.themes[value] }))}
          value={session.theme}
          onChange={(value) => session.update({ theme: value })}
          ink={colors.ink}
        />
      </Section>

      <Section title={t.thisPhone}>
        <View style={[styles.row, { backgroundColor: theme.card }]}>
          <View style={styles.grow}>
            <ThemedText type="caption">{t.who[role]}</ThemedText>
            <ThemedText style={styles.strong}>{phone}</ThemedText>
          </View>
          {/* A buyer's wallets are added, removed and made default on the card screen. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={role === 'vendor' ? `${t.change}: ${t.who.vendor}` : `${t.manage}: ${phone}`}
            onPress={() => (role === 'vendor' ? session.update({ vendorId: null }) : router.push('/buyer/card'))}
            style={styles.link}>
            <Text style={[styles.linkText, { color: colors.ink }]}>{role === 'vendor' ? t.change : t.manage}</Text>
          </Pressable>
        </View>
      </Section>

      <Section title={t.service}>
        <View style={[styles.box, { backgroundColor: theme.card }]}>
          <ThemedText type="caption">{t.apiUrl}</ThemedText>
          <ThemedText selectable style={styles.mono}>
            {apiUrl}
          </ThemedText>
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <View style={[styles.dot, { backgroundColor: connection.dot }]} />
            <Text style={[styles.connection, { color: connection.ink }]}>{connection.label}</Text>
          </View>
        </View>
      </Section>

      <Section title={t.debug}>
        <View style={[styles.row, { backgroundColor: theme.card }]}>
          <ThemedText style={[styles.grow, styles.optionText]}>{t.showLabels}</ThemedText>
          <Switch
            accessibilityLabel={t.showLabels}
            value={session.debugLabels}
            onValueChange={(debugLabels) => session.update({ debugLabels })}
            trackColor={{ false: theme.idle, true: colors.fill }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/debug')}
          style={({ pressed }) => [styles.row, styles.outlined, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText style={[styles.grow, styles.strong]}>{t.openDebug}</ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.text} />
        </Pressable>
      </Section>

      <View style={[styles.build, { borderColor: theme.border }]}>
        <ThemedText style={styles.strong}>{appRole ? t.roleLine[appRole] : t.noRole}</ThemedText>
        <ThemedText type="caption" style={styles.mono}>
          {appRole ? `EXPO_PUBLIC_APP_ROLE=${appRole} · v${version}` : `v${version}`}
        </ThemedText>
        <ThemedText type="caption">{t.buildNote}</ThemedText>
      </View>
    </Screen>
  );
}

type ChoicesProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ink: string;
};

// One radio row per option (language, theme).
function Choices<T extends string>({ label, options, value, onChange, ink }: ChoicesProps<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            style={[styles.option, { backgroundColor: theme.card }]}>
            <View style={[styles.radio, { borderColor: checked ? ink : theme.muted }]}>
              {checked && <View style={[styles.radioDot, { backgroundColor: ink }]} />}
            </View>
            <ThemedText style={styles.optionText}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
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

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  options: { gap: 8 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionText: { fontSize: 16, fontWeight: '600' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14 },
  outlined: { borderWidth: 1, minHeight: 48 },
  grow: { flex: 1 },
  strong: { fontSize: 16, fontWeight: '700' },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 15, fontWeight: '700' },
  box: { gap: 6, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connection: { fontSize: 14, fontWeight: '700' },
  build: { gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
});
