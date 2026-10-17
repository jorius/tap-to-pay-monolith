import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BuyerView } from '@/api/types';
import { Chip } from '@/components/buyer/chip';
import { Initials } from '@/components/buyer/initials';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    help: 'Elige tu nombre. Este teléfono será tu tarjeta; tus billeteras se administran en Tarjeta.',
    wallets: (n: number) => (n === 1 ? '1 billetera' : `${n} billeteras`),
    granted: 'Autorizada ✓',
    notGranted: 'Sin autorización · npm run grant:buyer',
    empty: 'El servicio no tiene compradores todavía: corre npm run seed en el portátil.',
    foot: 'La autorización se da una sola vez en la página de tu billetera. Hoy se hace desde el portátil con npm run grant:buyer.',
  },
  {
    help: 'Pick your name. This phone becomes your card; your wallets are managed under Card.',
    wallets: (n: number) => (n === 1 ? '1 wallet' : `${n} wallets`),
    granted: 'Authorized ✓',
    notGranted: 'Not authorized · npm run grant:buyer',
    empty: 'The service has no buyers yet: run npm run seed on the laptop.',
    foot: "Authorization is given once on your wallet's page. Today it is done from the laptop with npm run grant:buyer.",
  },
);

// Which buyer this phone is (design: BuyerIdentity); kept on the phone until Settings › Administrar.
export default function BuyerIdentity() {
  const router = useRouter();
  const { update } = useSession();
  const theme = useTheme();
  const colors = roleColors(theme, 'buyer');
  const t = useCopy(copy);
  const { data, error, loading, reload } = useApi<BuyerView[]>('/buyers');

  const pick = (buyer: BuyerView) => {
    update({ buyerId: buyer.id });
    router.replace('/buyer/card');
  };

  return (
    <Screen onRefresh={reload}>
      <ThemedText style={{ color: theme.muted }}>{t.help}</ThemedText>
      <LoadState loading={loading} error={error} hasData={data !== undefined} onRetry={reload} />
      {data?.length === 0 && <ThemedText>{t.empty}</ThemedText>}
      {data?.map((buyer) => {
        // The top-level fields are the default wallet's; an older service sends no wallets list.
        const count = buyer.wallets?.length ?? 1;
        return (
          <Pressable
            key={buyer.id}
            accessibilityRole="button"
            accessibilityLabel={`${buyer.name}, ${t.wallets(count)}, ${buyer.hasGrant ? t.granted : t.notGranted}`}
            onPress={() => pick(buyer)}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.card, opacity: pressed ? 0.8 : 1 }]}>
            <Initials name={buyer.name} size={44} background={colors.tint} color={colors.ink} />
            <View style={styles.info}>
              <ThemedText style={styles.name}>{buyer.name}</ThemedText>
              <ThemedText type="caption" numberOfLines={1} style={styles.mono}>
                {buyer.walletAddress}
              </ThemedText>
              <View style={styles.chips}>
                <Chip label={`${buyer.assetCode} · ${t.wallets(count)}`} />
                <StatusPill tone={buyer.hasGrant ? 'ok' : 'neutral'} label={buyer.hasGrant ? t.granted : t.notGranted} />
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
          </Pressable>
        );
      })}
      <ThemedText type="caption">{t.foot}</ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 14 },
  info: { flex: 1, gap: 5 },
  name: { fontSize: 17, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
