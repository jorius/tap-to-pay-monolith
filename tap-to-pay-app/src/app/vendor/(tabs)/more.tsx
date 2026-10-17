import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { VendorView } from '@/api/types';
import { Chip } from '@/components/buyer/chip';
import { Initials } from '@/components/buyer/initials';
import { Screen } from '@/components/screen';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { currencyName } from '@/components/vendor/format';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { vendorWallets, walletName } from '@/components/vendor/wallets';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    thisPhone: 'Este celular cobra para este negocio',
    wallets: 'Dónde recibo la plata',
    history: 'Mi historial de negocio',
    historyNote: 'Para mostrarlo al pedir un crédito',
    soon: 'Pronto',
    settings: 'Ajustes',
    settingsNote: 'Idioma, tema, sonido',
    help: 'Ayuda por WhatsApp',
    helpNote: 'Te respondemos en el día',
    change: 'Cambiar de negocio',
  },
  {
    thisPhone: 'This phone takes payments for this business',
    wallets: 'Where I get paid',
    history: 'My business history',
    historyNote: 'To show when asking for credit',
    soon: 'Soon',
    settings: 'Settings',
    settingsNote: 'Language, theme, sound',
    help: 'Help on WhatsApp',
    helpNote: 'We answer the same day',
    change: 'Switch business',
  },
);

// Baked in at bundle time (EXPO_PUBLIC_*): the number support answers on, digits only; unset hides the row.
const WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP;

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type RowProps = { icon: IconName; title: string; note: string; badge?: string; onPress?: () => void };

export default function MoreScreen() {
  return <VendorGate>{(vendor, _replace, reload) => <More vendor={vendor} reload={reload} />}</VendorGate>;
}

// Más (design): the business this phone charges for, and where the rest of the vendor's app lives.
function More({ vendor, reload }: { vendor: VendorView; reload: () => Promise<void> }) {
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const lang = useLang();
  const theme = useTheme();
  const router = useRouter();
  const wallets = vendorWallets(vendor);
  const receiving = wallets.find((w) => w.isDefault) ?? wallets[0];
  const rows: RowProps[] = [
    {
      icon: 'wallet-outline',
      title: t.wallets,
      note: `${walletName(receiving, v.walletNamed)} · ${currencyName(receiving.assetCode, lang)}`,
      onPress: () => router.push('/vendor/wallets'),
    },
    { icon: 'file-document-outline', title: t.history, note: t.historyNote, badge: t.soon },
    { icon: 'tune-variant', title: t.settings, note: t.settingsNote, onPress: () => router.push('/settings') },
    ...(WHATSAPP
      ? [{ icon: 'whatsapp' as const, title: t.help, note: t.helpNote, onPress: () => Linking.openURL(`https://wa.me/${WHATSAPP}`) }]
      : []),
  ];

  return (
    <Screen onRefresh={reload}>
      <ThemedView card style={styles.business}>
        <Initials name={vendor.name} size={48} background={theme.primaryTint} color={theme.primaryInk} />
        <View style={styles.grow}>
          <Text style={[styles.name, { color: theme.text }]}>{vendor.name}</Text>
          <Text style={[styles.note, { color: theme.muted }]}>{t.thisPhone}</Text>
        </View>
      </ThemedView>
      <ThemedView card style={styles.list}>
        {rows.map((row, i) => (
          <Row key={row.title} {...row} divider={i < rows.length - 1} />
        ))}
      </ThemedView>
      {/* The picker is only reachable from here (and Settings › Cambiar); the gate picks the first vendor by itself. */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/vendor')} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.linkText, { color: theme.primaryInk }]}>{t.change}</Text>
      </Pressable>
    </Screen>
  );
}

function Row({ icon, title, note, badge, onPress, divider }: RowProps & { divider: boolean }) {
  const theme = useTheme();
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderBottomWidth: 1, borderBottomColor: theme.border }, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.iconBox, { borderColor: theme.border }]}>
        <MaterialCommunityIcons name={icon} size={20} color={disabled ? theme.muted : theme.text} />
      </View>
      <View style={styles.grow}>
        <Text style={[styles.rowTitle, { color: disabled ? theme.muted : theme.text }]}>{title}</Text>
        <Text style={[styles.note, { color: theme.muted }]}>{note}</Text>
      </View>
      {badge ? <Chip label={badge} fill={theme.accentTint} ink={theme.accentInk} /> : null}
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  business: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18 },
  list: { padding: 0, paddingHorizontal: 16, gap: 0 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
});
