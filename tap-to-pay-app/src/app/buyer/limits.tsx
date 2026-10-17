import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatAmount, formatMoney, toMinor } from '@/api/money';
import type { BuyerWalletView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWalletError } from '@/components/wallet-error';
import { Fills } from '@/constants/theme';
import { useBuyerCards } from '@/hooks/use-buyer-cards';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    info: 'Te cuidan si pierdes el celular. Si una compra pasa el límite, no se cobra nada.',
    perPurchase: 'Por cada compra',
    perHint: 'máximo',
    daily: 'En todo el día',
    dailyHint: 'se renueva a medianoche',
    other: 'Otro valor',
    summary: (per: string, day: string) => `Hasta ${per} por compra y ${day} al día`,
    save: 'Guardar límites',
    saved: 'Límites guardados',
    perOverDay: 'El límite por compra no puede superar el del día.',
    overGrant: (amount: string) => `Tu billetera solo autoriza ${amount} al día. Para subirlo, renueva la autorización.`,
    renew: 'Renovar autorización',
    missing: 'Esta billetera ya no está entre las tuyas.',
  },
  {
    info: 'They protect you if you lose your phone. If a purchase goes over the limit, nothing is charged.',
    perPurchase: 'Per purchase',
    perHint: 'maximum',
    daily: 'Whole day',
    dailyHint: 'resets at midnight',
    other: 'Other amount',
    summary: (per: string, day: string) => `Up to ${per} per purchase and ${day} a day`,
    save: 'Save limits',
    saved: 'Limits saved',
    perOverDay: 'The per-purchase limit cannot exceed the daily one.',
    overGrant: (amount: string) => `Your wallet only authorizes ${amount} a day. Renew the authorization to raise it.`,
    renew: 'Renew authorization',
    missing: 'This wallet is no longer one of yours.',
  },
);

// Whole units of the wallet's asset: pesos need bigger numbers than dollars.
const PRESETS = {
  COP: { per: [20000, 50000, 100000], day: [100000, 200000, 500000] },
  other: { per: [20, 50, 100], day: [100, 200, 500] },
};

// Whole units picked or typed; `other` is the "Otro valor" field being open.
type Choice = { units: string; other: boolean };

// The caps of the default wallet, or of the one in walletId (design: Mis límites).
export default function LimitsScreen() {
  const { walletId } = useLocalSearchParams<{ walletId?: string }>();
  const cards = useBuyerCards();
  const t = useCopy(copy);
  const wallet = cards.wallets.find((w) => w.id === walletId) ?? cards.defaultWallet;
  return (
    <Screen>
      <LoadState loading={cards.loading} error={cards.error} hasData={cards.buyer !== undefined} onRetry={cards.reload} />
      {cards.buyer &&
        (wallet ? (
          <LimitsForm key={wallet.id} wallet={wallet} onSave={(limits) => cards.updateLimits(wallet, limits)} />
        ) : (
          <ThemedText>{t.missing}</ThemedText>
        ))}
    </Screen>
  );
}

// The whole units of a stored cap; "Otro valor" opens when they are not a preset (or the cap has cents).
function choiceOf(minor: string, scale: number, presets: number[]): Choice {
  const units = formatAmount(minor, scale).split('.')[0];
  return { units, other: !presets.includes(Number(units)) || toMinor(units, scale) !== minor };
}

type Limits = { perPaymentLimit: string; dailyLimit: string };
type Status = { ok: true } | { ok: false; message: string } | null;

function LimitsForm({ wallet, onSave }: { wallet: BuyerWalletView; onSave: (limits: Limits) => Promise<unknown> }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const router = useRouter();
  const walletError = useWalletError();
  const presets = PRESETS[wallet.assetCode === 'COP' ? 'COP' : 'other'];
  const [per, setPer] = useState(() => choiceOf(wallet.perPaymentLimit, wallet.assetScale, presets.per));
  const [day, setDay] = useState(() => choiceOf(wallet.dailyLimit, wallet.assetScale, presets.day));
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const perMinor = toMinor(per.units || '0', wallet.assetScale);
  const dayMinor = toMinor(day.units || '0', wallet.assetScale);
  const money = (minor: string) => formatMoney(minor, wallet.assetScale, wallet.assetCode, lang);
  const perOverDay = BigInt(perMinor) > BigInt(dayMinor);
  const valid = /[1-9]/.test(per.units) && /[1-9]/.test(day.units) && !perOverDay;
  const grant = wallet.grantDailyLimit;
  const overGrant = grant !== null && BigInt(dayMinor) > BigInt(grant);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await onSave({ perPaymentLimit: perMinor, dailyLimit: dayMinor });
      setStatus({ ok: true });
    } catch (e) {
      // The service's VALIDATION message (e.g. "perPaymentLimit must be ≤ dailyLimit") is shown as it comes.
      setStatus({ ok: false, message: walletError(e) });
    } finally {
      setSaving(false);
    }
  };

  const edit = (set: (choice: Choice) => void) => (choice: Choice) => {
    set(choice);
    setStatus(null);
  };

  return (
    <>
      <View style={[styles.info, { backgroundColor: theme.primaryTint }]}>
        <MaterialCommunityIcons name="shield-check-outline" size={24} color={theme.primaryInk} />
        <ThemedText style={styles.infoText}>{t.info}</ThemedText>
      </View>
      <LimitPicker title={t.perPurchase} hint={t.perHint} presets={presets.per} wallet={wallet} value={per} onChange={edit(setPer)} />
      <LimitPicker title={t.daily} hint={t.dailyHint} presets={presets.day} wallet={wallet} value={day} onChange={edit(setDay)} />
      {perOverDay && <ThemedText style={{ color: theme.outflow }}>{t.perOverDay}</ThemedText>}
      {grant !== null && overGrant && (
        <ThemedView card>
          <ThemedText>{t.overGrant(money(grant))}</ThemedText>
          <BigButton
            label={t.renew}
            color={theme.primaryInk}
            ghost
            onPress={() => router.push({ pathname: '/buyer/grant', params: { walletId: wallet.id } })}
          />
        </ThemedView>
      )}
      <ThemedText type="caption" style={styles.summary}>
        {t.summary(money(perMinor), money(dayMinor))}
      </ThemedText>
      <BigButton label={t.save} color={Fills.primary} disabled={saving || !valid} onPress={save} />
      <View accessibilityLiveRegion="polite">
        {status?.ok && <StatusPill tone="ok" label={t.saved} />}
        {status && !status.ok && <StatusPill tone="bad" label={status.message} />}
      </View>
    </>
  );
}

type PickerProps = {
  title: string;
  hint: string;
  presets: number[];
  wallet: BuyerWalletView;
  value: Choice;
  onChange: (value: Choice) => void;
};

// Three preset amounts and "Otro valor" in a 2×2 grid; the last one reveals a whole-unit field.
function LimitPicker({ title, hint, presets, wallet, value, onChange }: PickerProps) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const options = [
    ...presets.map((units) => ({
      key: String(units),
      label: formatMoney(toMinor(String(units), wallet.assetScale), wallet.assetScale, wallet.assetCode, lang),
      on: !value.other && value.units === String(units),
    })),
    { key: 'other', label: t.other, on: value.other },
  ];
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <ThemedText accessibilityRole="header" style={styles.blockTitle}>
          {title}
        </ThemedText>
        <ThemedText type="caption">{hint}</ThemedText>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.grid}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.on }}
            onPress={() => onChange(option.key === 'other' ? { ...value, other: true } : { units: option.key, other: false })}
            style={[
              styles.option,
              option.on
                ? { borderColor: theme.primaryInk, backgroundColor: theme.primaryTint }
                : { borderColor: theme.border, backgroundColor: theme.surface },
            ]}>
            <Text style={[styles.optionText, { color: option.on ? theme.primaryInk : theme.text }]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      {value.other && (
        <View style={[styles.inputBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            accessibilityLabel={`${title}: ${t.other}`}
            keyboardType="number-pad"
            autoFocus
            value={value.units}
            onChangeText={(text) => onChange({ units: text.replace(/\D/g, '').replace(/^0+/, ''), other: true })}
            style={[styles.input, { color: theme.text }]}
          />
          <Text style={[styles.unit, { color: theme.muted }]}>{wallet.assetCode}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16 },
  infoText: { flex: 1, fontSize: 15, lineHeight: 22 },
  block: { gap: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  blockTitle: { fontSize: 17, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { flexGrow: 1, flexBasis: '45%', minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 14, paddingHorizontal: 12 },
  optionText: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 52, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, fontWeight: '600' },
  summary: { textAlign: 'center' },
});
