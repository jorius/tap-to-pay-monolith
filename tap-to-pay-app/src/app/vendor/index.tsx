import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { vendorWallets } from '@/components/vendor/wallets';
import { roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    help: 'Elige tu negocio. Las ventas de esta terminal llegan a su billetera de cobro.',
    empty: 'El servicio no tiene comercios todavía: corre npm run seed en el portátil.',
    foot: 'La lista viene del servicio. Si no ves tu negocio, pide que lo registren con npm run seed.',
    wallets: (n: number) => (n === 1 ? '1 billetera' : `${n} billeteras`),
  },
  {
    help: "Pick your business. This terminal's sales land in its receiving wallet.",
    empty: 'The service has no vendors yet: run npm run seed on the laptop.',
    foot: "The list comes from the service. If your business isn't here, ask for it to be added with npm run seed.",
    wallets: (n: number) => (n === 1 ? '1 wallet' : `${n} wallets`),
  },
);

// Which vendor this phone is (design: VendorIdentity); kept on the phone until Settings › Cambiar.
export default function VendorIdentity() {
  const router = useRouter();
  const { update } = useSession();
  const theme = useTheme();
  const { tint, ink } = roleColors(theme, 'vendor');
  const t = useCopy(copy);
  const { data, error, reload } = useApi<VendorView[]>('/vendors');

  const pick = (vendor: VendorView) => {
    update({ vendorId: vendor.id });
    router.replace('/vendor/sale');
  };

  return (
    <Screen onRefresh={reload}>
      <ThemedText style={{ color: theme.muted }}>{t.help}</ThemedText>
      {data ? null : error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState />}
      {data?.length === 0 && <ThemedText>{t.empty}</ThemedText>}
      {data?.map((vendor) => {
        // The address and currency shown are the receiving wallet's (the top-level fields).
        const count = vendorWallets(vendor).length;
        return (
          <Pressable
            key={vendor.id}
            accessibilityRole="button"
            accessibilityLabel={`${vendor.name}, ${vendor.assetCode}, ${t.wallets(count)}`}
            onPress={() => pick(vendor)}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.card, opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.avatar, { backgroundColor: tint }]}>
              <Text style={[styles.initials, { color: ink }]}>{initials(vendor.name)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.name, { color: theme.text }]}>{vendor.name}</Text>
              <Text numberOfLines={1} style={[styles.mono, { color: theme.muted }]}>
                {vendor.walletAddress}
              </Text>
              <Text style={[styles.asset, { color: theme.text, borderColor: theme.border }]}>
                {vendor.assetCode} · {t.wallets(count)}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
          </Pressable>
        );
      })}
      <ThemedText type="caption">{t.foot}</ThemedText>
    </Screen>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 16, fontWeight: '800' },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 11.5 },
  asset: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderRadius: 999, fontSize: 12, fontWeight: '700' },
});
