import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { BuyerWalletView } from '@/api/types';
import { AddWalletSheet } from '@/components/add-wallet-sheet';
import { BigButton } from '@/components/big-button';
import { Chip } from '@/components/buyer/chip';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useWalletError } from '@/components/wallet-error';
import { Fill, roleColors } from '@/constants/theme';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    intro:
      'Cada billetera tiene una sola moneda y es una de tus tarjetas. Con la app abierta en Tarjeta paga la que tengas en pantalla; si no, la predeterminada.',
    scale: (scale: number) => `escala ${scale}`,
    defaultCard: 'Predeterminada',
    granted: 'Autorizada ✓',
    notGranted: 'Sin autorización',
    perDay: (limit: string) => `Autorizado en la billetera: ${limit} por día`,
    noCap: 'Autorizada sin tope de monto: el servicio aplica tus topes',
    grantHow: 'Autorízala desde el portátil:',
    makeDefault: 'Establecer como predeterminada',
    add: 'Agregar billetera',
  },
  {
    intro:
      'Each wallet holds one currency and is one of your cards. With the app open on Card, the one on screen pays; otherwise the default one.',
    scale: (scale: number) => `scale ${scale}`,
    defaultCard: 'Default',
    granted: 'Authorized ✓',
    notGranted: 'Not authorized',
    perDay: (limit: string) => `Authorized in the wallet: ${limit} per day`,
    noCap: 'Authorized with no amount cap: the service applies your limits',
    grantHow: 'Authorize it from the laptop:',
    makeDefault: 'Set as default',
    add: 'Add a wallet',
  },
);

// The buyer's wallets (design: BuyerWallets): currency, authorization, and which one is the default.
export default function WalletsScreen() {
  const cards = useBuyerCards();
  const theme = useTheme();
  const t = useCopy(copy);
  const walletError = useWalletError();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeDefault = async (wallet: BuyerWalletView) => {
    setBusy(true);
    setError(null);
    try {
      await cards.setDefault(wallet);
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={cards.reload}>
      <ThemedText style={{ color: theme.muted }}>{t.intro}</ThemedText>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.wallets.map((wallet) => (
        <WalletCard key={wallet.id} wallet={wallet} busy={busy} onMakeDefault={() => makeDefault(wallet)} />
      ))}
      <View accessibilityLiveRegion="polite">{error && <StatusPill tone="bad" label={error} />}</View>
      {cards.buyer && (
        <BigButton label={t.add} color={roleColors(theme, 'buyer').ink} ghost onPress={() => setAdding(true)} />
      )}
      <AddWalletSheet role="buyer" visible={adding} onClose={() => setAdding(false)} onAdd={cards.addWallet} onAdded={() => {}} />
    </Screen>
  );
}

type WalletCardProps = { wallet: BuyerWalletView; busy: boolean; onMakeDefault: () => void };

function WalletCard({ wallet, busy, onMakeDefault }: WalletCardProps) {
  const theme = useTheme();
  const colors = roleColors(theme, 'buyer');
  const t = useCopy(copy);
  const lang = useLang();
  const limit = wallet.grantDailyLimit ?? null;

  return (
    <View style={[styles.wallet, { borderColor: wallet.isDefault ? colors.ink : theme.border }]}>
      <View style={styles.head}>
        <ThemedText style={styles.code}>{wallet.assetCode}</ThemedText>
        <Chip label={t.scale(wallet.assetScale)} />
      </View>
      <ThemedText type="caption" selectable style={styles.mono}>
        {wallet.walletAddress}
      </ThemedText>
      <View style={styles.chips}>
        {wallet.isDefault && <Chip label={t.defaultCard} fill={Fill.buyer} />}
        <StatusPill tone={wallet.hasGrant ? 'ok' : 'neutral'} label={wallet.hasGrant ? t.granted : t.notGranted} />
      </View>
      {wallet.hasGrant ? (
        <ThemedText type="caption">
          {limit === null ? t.noCap : t.perDay(formatMoney(limit, wallet.assetScale, wallet.assetCode, lang))}
        </ThemedText>
      ) : (
        <>
          <ThemedText type="caption">{t.grantHow}</ThemedText>
          <Text selectable style={[styles.command, { color: theme.text, backgroundColor: theme.card }]}>
            npm run grant:buyer -- --buyer {wallet.walletAddress}
          </Text>
        </>
      )}
      {!wallet.isDefault && <BigButton label={t.makeDefault} color={Fill.buyer} disabled={busy} onPress={onMakeDefault} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wallet: { borderWidth: 2, borderRadius: 20, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  command: { fontFamily: 'monospace', fontSize: 12.5, lineHeight: 18, padding: 10, borderRadius: 10 },
});
