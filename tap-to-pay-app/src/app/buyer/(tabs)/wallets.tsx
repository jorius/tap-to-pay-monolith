import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, useColorScheme, View } from 'react-native';

import type { BuyerView, VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { Chip } from '@/components/buyer/chip';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Fill, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    intro: 'Cada billetera tiene una sola moneda. Tu tarjeta paga desde la billetera marcada como activa.',
    scale: (scale: number) => `escala ${scale}`,
    activeCard: 'Tarjeta activa',
    granted: 'Autorizada ✓',
    notGranted: 'Sin autorización',
    compatOk: (vendor: string, code: string) => `Disponible en ${vendor}: cobra en ${code}`,
    compatNo: (vendor: string, code: string) => `No disponible en ${vendor}: cobra en ${code}`,
    authorize: 'Autorizar',
    add: 'Agregar billetera',
    addNote:
      'Hoy la autorización se da con npm run grant:buyer desde el portátil; en el MVP este botón abrirá la página de consentimiento de tu billetera.',
  },
  {
    intro: 'Each wallet holds a single currency. Your card pays from the wallet marked as active.',
    scale: (scale: number) => `scale ${scale}`,
    activeCard: 'Active card',
    granted: 'Authorized ✓',
    notGranted: 'Not authorized',
    compatOk: (vendor: string, code: string) => `Available at ${vendor}: it charges in ${code}`,
    compatNo: (vendor: string, code: string) => `Not available at ${vendor}: it charges in ${code}`,
    authorize: 'Authorize',
    add: 'Add wallet',
    addNote:
      "Today authorization is given with npm run grant:buyer from the laptop; in the MVP this button opens your wallet's consent page.",
  },
);

// Not a theme token yet; only this screen uses it (design BuyerWallets okTint).
const OK_TINT = { light: '#E6F4EC', dark: '#0F2A1D' } as const;

// The buyer's wallets and where each one can pay (design: BuyerWallets, CurrencyMatrix). Today a buyer has one wallet;
// a sale is refused with ASSET_MISMATCH when its currency differs from the vendor's (SDD §7).
export default function WalletsScreen() {
  const { buyerId } = useSession();
  const theme = useTheme();
  const okTint = OK_TINT[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const colors = roleColors(theme, 'buyer');
  const t = useCopy(copy);
  const buyerReq = useApi<BuyerView>(`/buyers/${buyerId}`);
  const vendorsReq = useApi<VendorView[]>('/vendors');
  const buyer = buyerReq.data;

  return (
    <Screen>
      <ThemedText style={{ color: theme.muted }}>{t.intro}</ThemedText>
      <LoadState loading={buyerReq.loading} error={buyerReq.error} hasData={buyer !== undefined} onRetry={buyerReq.reload} />
      {buyer && (
        <View style={[styles.wallet, { borderColor: colors.ink }]}>
          <View style={styles.head}>
            <ThemedText style={styles.code}>{buyer.assetCode}</ThemedText>
            <Chip label={t.scale(buyer.assetScale)} />
          </View>
          <ThemedText type="caption" selectable style={styles.mono}>
            {buyer.walletAddress}
          </ThemedText>
          <View style={styles.chips}>
            <Chip label={t.activeCard} fill={Fill.buyer} />
            <StatusPill tone={buyer.hasGrant ? 'ok' : 'neutral'} label={buyer.hasGrant ? t.granted : t.notGranted} />
          </View>
          {vendorsReq.data?.map((vendor) => {
            const ok = vendor.assetCode === buyer.assetCode;
            return (
              <View key={vendor.id} style={[styles.compat, { backgroundColor: ok ? okTint : theme.badTint }]}>
                <MaterialCommunityIcons name={ok ? 'check' : 'close'} size={18} color={ok ? theme.okInk : theme.badInk} />
                <ThemedText style={styles.compatText}>
                  {ok ? t.compatOk(vendor.name, vendor.assetCode) : t.compatNo(vendor.name, vendor.assetCode)}
                </ThemedText>
              </View>
            );
          })}
          {vendorsReq.error && <StatusPill tone="bad" label={vendorsReq.error.message} />}
          {!buyer.hasGrant && <BigButton label={t.authorize} color={colors.ink} ghost disabled onPress={() => {}} />}
        </View>
      )}
      <BigButton label={t.add} color={theme.text} ghost disabled onPress={() => {}} />
      <ThemedText type="caption">{t.addNote}</ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wallet: { borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  compat: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  compatText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600' },
});
