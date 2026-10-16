import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { ConnectionLabel } from '@/components/connection-label';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { appRole } from '@/config/role';
import { Fill } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { defineCopy, useCopy } from '@/i18n';

// Entry gate: a role-locked build goes to the welcome screen once, then to its identity pick or straight to its tabs.
export default function Index() {
  const { welcomeSeen, vendorId, buyerId } = useSession();
  if (!appRole) return <DevRolePicker />;
  if (!welcomeSeen) return <Redirect href="/welcome" />;
  if (appRole === 'vendor') return <Redirect href={vendorId ? '/vendor/sale' : '/vendor'} />;
  return <Redirect href={buyerId ? '/buyer/card' : '/buyer'} />;
}

const copy = defineCopy(
  {
    title: 'Este teléfono es…',
    note: 'Build sin rol: solo para desarrollo. Compila con EXPO_PUBLIC_APP_ROLE=vendor o buyer (scripts/build-apk.sh).',
    vendor: 'Terminal del comercio',
    buyer: 'Tarjeta del comprador',
    debug: 'Herramientas de depuración',
  },
  {
    title: 'This phone is…',
    note: 'Build without a role: development only. Build with EXPO_PUBLIC_APP_ROLE=vendor or buyer (scripts/build-apk.sh).',
    vendor: 'Vendor terminal',
    buyer: 'Buyer card',
    debug: 'Debug tools',
  },
);

// Only a build without EXPO_PUBLIC_APP_ROLE shows this; release APKs are always role-locked.
function DevRolePicker() {
  const router = useRouter();
  const t = useCopy(copy);
  return (
    <Screen>
      <ThemedText type="title">{t.title}</ThemedText>
      <ThemedText type="caption">{t.note}</ThemedText>
      <BigButton label={t.vendor} color={Fill.vendor} onPress={() => router.push('/vendor')} />
      <BigButton label={t.buyer} color={Fill.buyer} onPress={() => router.push('/buyer')} />
      <View style={styles.footer}>
        <ConnectionLabel />
        <BigButton label={t.debug} color={Fill.service} onPress={() => router.push('/debug')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: 24, gap: 8 },
});
