import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { ConnectionLabel } from '@/components/connection-label';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { appRole, type AppRole } from '@/config/role';
import { Brand, Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { defineCopy, useCopy } from '@/i18n';

// Entry gate: a role-locked build goes to the welcome screen once, then straight to its tabs.
export default function Index() {
  const { welcomeSeen, vendorId, buyerId } = useSession();
  if (!appRole) return <DevRolePicker />;
  if (!welcomeSeen) return <Redirect href="/welcome" />;
  if (appRole === 'vendor') return vendorId ? <Redirect href="/vendor/sale" /> : <AutoPick role="vendor" />;
  return buyerId ? <Redirect href="/buyer/card" /> : <AutoPick role="buyer" />;
}

const pickCopy = defineCopy(
  {
    none: {
      vendor: 'El servicio no tiene comercios todavía: corre npm run seed en el portátil.',
      buyer: 'El servicio no tiene compradores todavía: corre npm run seed en el portátil.',
    },
  },
  {
    none: {
      vendor: 'The service has no vendors yet: run npm run seed on the laptop.',
      buyer: 'The service has no buyers yet: run npm run seed on the laptop.',
    },
  },
);

// No "who are you" step: the phone becomes the first vendor or buyer the service lists, and the gate then opens the
// tabs. Settings › Cambiar still picks another one.
function AutoPick({ role }: { role: AppRole }) {
  const { update } = useSession();
  const t = useCopy(pickCopy);
  const { data, error, reload } = useApi<{ id: string }[]>(role === 'vendor' ? '/vendors' : '/buyers');
  const first = data?.[0]?.id;
  useEffect(() => {
    if (first) update(role === 'vendor' ? { vendorId: first } : { buyerId: first });
  }, [first, role, update]);

  return (
    <Screen>
      {data?.length === 0 ? (
        <ThemedText>{t.none[role]}</ThemedText>
      ) : (
        <LoadState loading={!error} error={error} hasData={false} onRetry={reload} />
      )}
    </Screen>
  );
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
      <BigButton label={t.vendor} color={Fills.primary} onPress={() => router.push('/vendor')} />
      <BigButton label={t.buyer} color={Fills.primary} onPress={() => router.push('/buyer')} />
      <View style={styles.footer}>
        <ConnectionLabel />
        <BigButton label={t.debug} color={Brand.tealDark} onPress={() => router.push('/debug')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: 24, gap: 8 },
});
