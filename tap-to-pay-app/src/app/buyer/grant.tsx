import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { formatMoney } from '@/api/money';
import type { BuyerView, BuyerWalletView, GrantStart } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Fills } from '@/constants/theme';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    intro: 'Dale permiso a Paynela una sola vez para pagar con esta billetera, hasta el monto diario que elijas. Lo confirmas en la página de tu billetera.',
    daily: 'Monto diario permitido',
    owner: (address: string) =>
      `En la página de la billetera entra con la cuenta dueña de ${address}. Con otra cuenta la billetera rechaza el permiso («Access to the given resource is forbidden»).`,
    current: (amount: string) => `Hoy tiene permiso hasta ${amount} por día; darlo de nuevo reemplaza ese monto.`,
    authorize: 'Dar permiso en mi billetera',
    waiting: 'Confirma en tu billetera…',
    saving: 'Guardando…',
    done: (amount: string) => `Permiso dado · ${amount} por día`,
    cancelled: 'Cerraste la página de tu billetera sin dar permiso.',
    rejected: 'Rechazaste el permiso en tu billetera.',
    noAnswer: 'Tu billetera no devolvió el permiso. Inténtalo de nuevo.',
    missing: 'Esta billetera ya no está entre las tuyas.',
    ok: 'Listo',
    granted: 'Con permiso',
    notGranted: 'Sin permiso',
    revoke: 'Quitar el permiso',
    revokeTitle: '¿Quitar el permiso?',
    revokeBody: 'Paynela deja de poder pagar con esta billetera hasta que le des permiso de nuevo.',
    cancel: 'Cancelar',
    removing: 'Quitando…',
    revoked: 'Permiso quitado.',
  },
  {
    intro: 'Give Paynela permission once to pay with this wallet, up to the daily amount you choose. You confirm it on your wallet page.',
    daily: 'Allowed daily amount',
    owner: (address: string) =>
      `On the wallet page, sign in with the account that owns ${address}. With another account the wallet refuses the permission ("Access to the given resource is forbidden").`,
    current: (amount: string) => `It has permission up to ${amount} per day; giving it again replaces that amount.`,
    authorize: 'Give permission in my wallet',
    waiting: 'Confirm in your wallet…',
    saving: 'Saving…',
    done: (amount: string) => `Permission given · ${amount} per day`,
    cancelled: 'You closed your wallet page without giving permission.',
    rejected: 'You declined the permission in your wallet.',
    noAnswer: 'Your wallet did not send the permission back. Try again.',
    missing: 'This wallet is no longer one of yours.',
    ok: 'Done',
    granted: 'Permission given',
    notGranted: 'No permission',
    revoke: 'Remove permission',
    revokeTitle: 'Remove the permission?',
    revokeBody: 'Paynela can no longer pay with this wallet until you give permission again.',
    cancel: 'Cancel',
    removing: 'Removing…',
    revoked: 'Permission removed.',
  },
);

// The wallet answers with GNAP's interact_ref and hash; the service may wait on the wallet for a few seconds.
const TIMEOUT_MS = 20_000;

type Step =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'done'; amount: string }
  | { kind: 'note'; message: string; tone: 'bad' | 'neutral' };

// The buyer's in-app authorization (SDD section 10, step 3): the wallet's page opens in the browser, the buyer accepts,
// and the wallet sends them back to paynela://grant-finish, which this screen relays to the service.
export default function GrantScreen() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const cards = useBuyerCards();
  const t = useCopy(copy);
  const wallet = cards.wallets.find((w) => w.id === walletId);
  return (
    <Screen>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.buyer &&
        (wallet ? (
          <GrantForm key={wallet.id} buyerId={cards.buyer.id} wallet={wallet} onChanged={cards.reload} />
        ) : (
          <ThemedText>{t.missing}</ThemedText>
        ))}
    </Screen>
  );
}

// onChanged re-reads the buyer, so the wallet shown follows a grant given or removed here.
type FormProps = { buyerId: string; wallet: BuyerWalletView; onChanged: () => Promise<unknown> };

function GrantForm({ buyerId, wallet, onChanged }: FormProps) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const router = useRouter();
  const [digits, setDigits] = useState(wallet.grantDailyLimit ?? wallet.dailyLimit);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const money = (amount: string) => formatMoney(amount, wallet.assetScale, wallet.assetCode, lang);
  const path = `/buyers/${buyerId}/wallets/${wallet.id}/grant`;

  const authorize = async () => {
    const finishUri = Linking.createURL('grant-finish');
    setStep({ kind: 'busy', label: t.waiting });
    try {
      const { redirectUrl } = await api<GrantStart>(path, {
        method: 'POST',
        body: { finishUri, amount: digits },
        timeoutMs: TIMEOUT_MS,
      });
      const result = await WebBrowser.openAuthSessionAsync(redirectUrl, finishUri);
      if (result.type !== 'success') return setStep({ kind: 'note', message: t.cancelled, tone: 'neutral' });
      const { queryParams } = Linking.parse(result.url);
      if (queryParams?.result === 'grant_rejected') return setStep({ kind: 'note', message: t.rejected, tone: 'neutral' });
      const interactRef = queryParams?.interact_ref;
      const hash = queryParams?.hash;
      if (typeof interactRef !== 'string' || typeof hash !== 'string') {
        return setStep({ kind: 'note', message: t.noAnswer, tone: 'bad' });
      }
      setStep({ kind: 'busy', label: t.saving });
      const buyer = await api<BuyerView>(`${path}/finish`, {
        method: 'POST',
        body: { interactRef, hash },
        timeoutMs: TIMEOUT_MS,
      });
      const granted = buyer.wallets.find((w) => w.id === wallet.id)?.grantDailyLimit ?? digits;
      setStep({ kind: 'done', amount: money(granted) });
      onChanged();
    } catch (e) {
      setStep({ kind: 'note', message: e instanceof ApiError ? e.message : String(e), tone: 'bad' });
    }
  };

  // Also the way out after revoking it in the wallet: the service would otherwise keep the dead token as a grant.
  const revoke = async () => {
    setStep({ kind: 'busy', label: t.removing });
    try {
      await api<BuyerView>(path, { method: 'DELETE', timeoutMs: TIMEOUT_MS });
      await onChanged();
      setStep({ kind: 'note', message: t.revoked, tone: 'neutral' });
    } catch (e) {
      setStep({ kind: 'note', message: e instanceof ApiError ? e.message : String(e), tone: 'bad' });
    }
  };

  const confirmRevoke = () =>
    Alert.alert(t.revokeTitle, t.revokeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.revoke, style: 'destructive', onPress: revoke },
    ]);

  if (step.kind === 'done') {
    return (
      <View style={styles.done} accessibilityLiveRegion="polite">
        <View style={styles.disc}>
          <MaterialCommunityIcons name="check" size={44} color="#FFFFFF" />
        </View>
        <Text style={[styles.doneTitle, { color: theme.income }]}>{t.done(step.amount)}</Text>
        <BigButton
          label={t.ok}
          color={Fills.primary}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/buyer/card'))}
        />
      </View>
    );
  }

  const busy = step.kind === 'busy';
  return (
    <>
      <ThemedText style={{ color: theme.muted }}>{t.intro}</ThemedText>
      <View style={[styles.wallet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.walletHead}>
          <Text numberOfLines={1} style={[styles.walletName, { color: theme.text }]}>
            {wallet.publicName ?? wallet.assetCode}
          </Text>
          <Text style={[styles.code, { color: theme.primaryInk, backgroundColor: theme.primaryTint }]}>{wallet.assetCode}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.mono, { color: theme.muted }]}>
          {wallet.walletAddress.replace(/^https?:\/\//, '')}
        </Text>
        <StatusPill tone={wallet.hasGrant ? 'ok' : 'neutral'} label={wallet.hasGrant ? t.granted : t.notGranted} />
      </View>
      {/* The Test Wallet only shows the consent to the account that owns this address; any other gets a 403 page. */}
      {!wallet.hasGrant && <ThemedText type="caption">{t.owner(wallet.walletAddress.replace(/^https?:\/\//, '$'))}</ThemedText>}
      {wallet.grantDailyLimit ? <ThemedText type="caption">{t.current(money(wallet.grantDailyLimit))}</ThemedText> : null}
      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>{t.daily}</ThemedText>
        <View style={[styles.inputBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Cents-shift entry, as on the card screen: only typed digits count, so no decimal key can move the comma. */}
          <TextInput
            accessibilityLabel={t.daily}
            keyboardType="number-pad"
            editable={!busy}
            value={formatMoney(digits, wallet.assetScale, '', lang).trimEnd()}
            onChangeText={(text) => setDigits(text.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')}
            style={[styles.input, { color: theme.text }]}
          />
          <Text style={[styles.unit, { color: theme.muted }]}>{wallet.assetCode}</Text>
        </View>
      </View>
      <BigButton
        label={busy ? step.label : t.authorize}
        color={Fills.primary}
        disabled={busy || !/[1-9]/.test(digits)}
        onPress={authorize}
      />
      {wallet.hasGrant && <BigButton label={t.revoke} color={theme.outflow} ghost disabled={busy} onPress={confirmRevoke} />}
      <View accessibilityLiveRegion="polite">
        {step.kind === 'note' && <StatusPill tone={step.tone} label={step.message} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wallet: { gap: 6, borderWidth: 1, borderRadius: 16, padding: 16 },
  walletHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  walletName: { flexShrink: 1, fontSize: 18, fontWeight: '600' },
  code: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  mono: { fontFamily: 'monospace', fontSize: 12.5 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 52, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, fontWeight: '600' },
  done: { gap: 16, paddingVertical: 24 },
  disc: { alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Fills.income },
  doneTitle: { fontSize: 22, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
});
