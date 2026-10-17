import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api/client';
import type { BillerView, PayerWallet, RecurringView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { BillerBadge } from '@/components/recurring/biller-badge';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { Brand, Fill } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    pickTitle: '¿Qué quieres pagar cada mes?',
    other: 'Otro servicio',
    otherHint: 'Cualquier billetera Interledger',
    unavailable: 'Sin billetera configurada',
    back: 'Atrás',
    close: 'Cerrar',
    name: 'Nombre del servicio',
    namePlaceholder: 'Ej. Arriendo, gimnasio, colegio',
    wallet: 'Billetera Interledger del servicio',
    walletPlaceholder: '$ilp.interledger-test.dev/servicio',
    reference: 'Número de referencia (opcional)',
    optional: '(opcional)',
    amount: 'Monto mensual',
    amountHint: 'En la moneda de la billetera del servicio, ej. 45000 o 45000,50.',
    day: 'Día del mes en que se paga',
    dayHint: 'Se cobra a las 8:00 a. m. de ese día, del 1 al 28.',
    payWith: 'Pagar con',
    noGrant: 'sin autorizar',
    save: 'Inscribir pago',
    saving: 'Inscribiendo…',
  },
  {
    pickTitle: 'What do you want to pay every month?',
    other: 'Another service',
    otherHint: 'Any Interledger wallet',
    unavailable: 'No wallet configured',
    back: 'Back',
    close: 'Close',
    name: 'Service name',
    namePlaceholder: 'E.g. rent, gym, school',
    wallet: "The service's Interledger wallet",
    walletPlaceholder: '$ilp.interledger-test.dev/service',
    reference: 'Reference number (optional)',
    optional: '(optional)',
    amount: 'Monthly amount',
    amountHint: "In the service wallet's currency, e.g. 45000 or 45000.50.",
    day: 'Day of the month it is paid',
    dayHint: 'It is charged at 8:00 a.m. that day, from the 1st to the 28th.',
    payWith: 'Pay with',
    noGrant: 'not authorized',
    save: 'Enrol payment',
    saving: 'Enrolling…',
  },
);

type Props = {
  visible: boolean;
  // Where the payments live: /vendors/<id>.
  ownerPath: string;
  billers: BillerView[];
  wallets: PayerWallet[];
  onClose: () => void;
  onAdded: (recurring: RecurringView) => void;
};

// "$wallet.example/alice" (a payment pointer) or "wallet.example/alice" to "https://wallet.example/alice".
const toUrl = (value: string) => {
  const v = value.trim();
  if (v.startsWith('$')) return `https://${v.slice(1)}`;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

// Enrol in a monthly payment: pick a service from the catalog (or "another" with any wallet), then the reference, the
// amount, the day and the paying wallet. The service resolves the payee's wallet and prices the amount in its asset.
export function AddRecurringSheet({ visible, ownerPath, billers, wallets, onClose, onAdded }: Props) {
  const theme = useTheme();
  const t = useCopy(copy);
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [biller, setBiller] = useState<BillerView | null>(null);
  const [name, setName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(5);
  const authorized = wallets.filter((w) => w.hasGrant);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('pick');
    setBiller(null);
    setName('');
    setWalletAddress('');
    setReference('');
    setAmount('');
    setDay(5);
    setWalletId(null);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = (b: BillerView | null) => {
    setBiller(b);
    setStep('form');
    setError(null);
  };

  const custom = biller === null;
  const ready = amount.trim() !== '' && (!custom || (name.trim() !== '' && walletAddress.trim() !== ''));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await api<RecurringView>(`${ownerPath}/recurring`, {
        method: 'POST',
        body: {
          ...(custom ? { payeeName: name.trim(), payeeWalletAddress: toUrl(walletAddress) } : { billerId: biller.id }),
          reference: reference.trim() || undefined,
          amount: amount.trim(),
          dayOfMonth: day,
          walletId: walletId ?? undefined,
        },
      });
      reset();
      onAdded(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const input = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.bar}>
          {step === 'form' ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setStep('pick')} style={styles.barButton}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
              <Text style={[styles.barText, { color: theme.text }]}>{t.back}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable accessibilityRole="button" hitSlop={12} onPress={close}>
            <Text style={[styles.barText, { color: theme.text }]}>{t.close}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'pick' ? (
            <>
              <ThemedText type="title">{t.pickTitle}</ThemedText>
              <View style={styles.grid}>
                {billers.map((b) => (
                  <Pressable
                    key={b.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.name}, ${b.category}`}
                    accessibilityState={{ disabled: !b.available }}
                    disabled={!b.available}
                    onPress={() => pick(b)}
                    style={({ pressed }) => [
                      styles.tile,
                      { backgroundColor: theme.card, opacity: !b.available ? 0.45 : pressed ? 0.7 : 1 },
                    ]}>
                    <BillerBadge biller={b} name={b.name} size={52} />
                    <Text style={[styles.tileName, { color: theme.text }]}>{b.name}</Text>
                    <Text numberOfLines={2} style={[styles.tileHint, { color: theme.muted }]}>
                      {b.available ? b.description : t.unavailable}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pick(null)}
                  style={({ pressed }) => [styles.tile, { backgroundColor: theme.card, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.plus, { borderColor: Brand.service }]}>
                    <MaterialCommunityIcons name="plus" size={28} color={Brand.service} />
                  </View>
                  <Text style={[styles.tileName, { color: theme.text }]}>{t.other}</Text>
                  <Text numberOfLines={2} style={[styles.tileHint, { color: theme.muted }]}>
                    {t.otherHint}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.selected}>
                <BillerBadge biller={biller ?? undefined} name={custom ? name || '+' : biller.name} size={56} />
                <View style={styles.flex}>
                  <ThemedText type="subtitle">{custom ? t.other : biller.name}</ThemedText>
                  <ThemedText type="caption">{custom ? t.otherHint : `${biller.category} · ${biller.description}`}</ThemedText>
                </View>
              </View>

              {custom && (
                <>
                  <Field label={t.name}>
                    <TextInput value={name} onChangeText={setName} placeholder={t.namePlaceholder} placeholderTextColor={theme.muted} style={input} />
                  </Field>
                  <Field label={t.wallet}>
                    <TextInput
                      value={walletAddress}
                      onChangeText={setWalletAddress}
                      placeholder={t.walletPlaceholder}
                      placeholderTextColor={theme.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={input}
                    />
                  </Field>
                </>
              )}

              <Field label={custom ? t.reference : `${biller.referenceLabel} ${t.optional}`}>
                <TextInput value={reference} onChangeText={setReference} placeholderTextColor={theme.muted} style={input} />
              </Field>

              <Field label={t.amount} hint={t.amountHint}>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="45000" placeholderTextColor={theme.muted} style={[input, styles.amount]} />
              </Field>

              <Field label={t.day} hint={t.dayHint}>
                <View style={styles.stepper}>
                  <StepButton icon="minus" disabled={day <= 1} onPress={() => setDay((d) => Math.max(1, d - 1))} />
                  <Text accessibilityLiveRegion="polite" style={[styles.day, { color: theme.text }]}>
                    {day}
                  </Text>
                  <StepButton icon="plus" disabled={day >= 28} onPress={() => setDay((d) => Math.min(28, d + 1))} />
                </View>
              </Field>

              {authorized.length > 1 && (
                <Field label={t.payWith}>
                  <View style={styles.wallets}>
                    {wallets.map((w) => {
                      const selected = (walletId ?? authorized.find((a) => a.isDefault)?.id ?? authorized[0]?.id) === w.id;
                      return (
                        <Pressable
                          key={w.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected, disabled: !w.hasGrant }}
                          disabled={!w.hasGrant}
                          onPress={() => setWalletId(w.id)}
                          style={[styles.wallet, { borderColor: selected ? Fill.vendor : theme.border, opacity: w.hasGrant ? 1 : 0.4 }]}>
                          <Text style={[styles.walletText, { color: theme.text }]}>
                            {(w.publicName ?? w.assetCode) + ' · ' + w.assetCode}
                          </Text>
                          {!w.hasGrant && <ThemedText type="caption">{t.noGrant}</ThemedText>}
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              )}

              {error && <StatusPill tone="bad" label={error} />}
              <BigButton label={saving ? t.saving : t.save} color={Fill.vendor} disabled={!ready || saving} onPress={save} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {children}
      {hint ? <ThemedText type="caption">{hint}</ThemedText> : null}
    </View>
  );
}

function StepButton({ icon, disabled, onPress }: { icon: 'minus' | 'plus'; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'plus' ? '+1' : '-1'}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, { borderColor: theme.border, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={24} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  barButton: { flexDirection: 'row', alignItems: 'center' },
  barText: { fontSize: 17, fontWeight: '600' },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', flexGrow: 1, borderRadius: 18, padding: 14, gap: 6, minHeight: 136 },
  tileName: { fontSize: 17, fontWeight: '800' },
  tileHint: { fontSize: 13, lineHeight: 18 },
  plus: { width: 52, height: 52, borderRadius: 15, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1 },
  field: { gap: 6 },
  label: { fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  amount: { fontSize: 22, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  step: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 28, fontWeight: '800', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  wallets: { gap: 8 },
  wallet: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 2 },
  walletText: { fontSize: 16, fontWeight: '700' },
});
