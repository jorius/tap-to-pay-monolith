import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import { formatMoney } from '@/api/money';
import type { BuyerView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { LoadState } from '@/components/buyer/load-state';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Fill, roleColors } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';
import { NfcTap } from '@/nfc/nfc-tap';

const copy = defineCopy(
  {
    walletLabel: (code: string) => `Billetera ${code}`,
    on: 'Activa',
    off: 'Inactiva',
    isCard: '✓ Este teléfono es tu tarjeta',
    hce: 'HCE activa',
    screenOn: 'Responde con la pantalla encendida, aunque esté bloqueada.',
    deactivate: 'Desactivar',
    activate: 'Usar este teléfono como mi tarjeta',
    needs: 'Necesita tu autorización y un teléfono con HCE (android.hardware.nfc.hce).',
    noGrant: 'Falta tu autorización: corre npm run grant:buyer en el portátil.',
    noHce: 'Este teléfono no reporta HCE.',
    noModule: 'Este build todavía no trae el módulo NFC.',
    simulated: 'Simulación de depuración: sin módulo NFC el teléfono no responde a toques reales.',
    leftToday: 'Disponible hoy',
    usedAria: 'Usado hoy',
    used: (spent: string, daily: string) => `${spent} de ${daily} usados · se reinicia a medianoche (Bogotá)`,
    limits: 'Topes',
    perPayment: 'Tope por pago',
    daily: 'Tope diario',
    units: (per: string, day: string) => `Se guardan en la unidad mínima: ${per} · ${day}`,
    save: 'Guardar topes',
    saved: 'Topes guardados',
  },
  {
    walletLabel: (code: string) => `${code} wallet`,
    on: 'Active',
    off: 'Inactive',
    isCard: '✓ This phone is your card',
    hce: 'HCE active',
    screenOn: 'It answers with the screen on, even when locked.',
    deactivate: 'Deactivate',
    activate: 'Use this phone as my card',
    needs: 'Needs your authorization and a phone with HCE (android.hardware.nfc.hce).',
    noGrant: 'Your authorization is missing: run npm run grant:buyer on the laptop.',
    noHce: 'This phone does not report HCE.',
    noModule: 'This build does not include the NFC module yet.',
    simulated: 'Debug simulation: without the NFC module the phone does not answer real taps.',
    leftToday: 'Left today',
    usedAria: 'Used today',
    used: (spent: string, daily: string) => `${spent} of ${daily} used · resets at midnight (Bogotá)`,
    limits: 'Limits',
    perPayment: 'Per-payment limit',
    daily: 'Daily limit',
    units: (per: string, day: string) => `Stored in the smallest unit: ${per} · ${day}`,
    save: 'Save limits',
    saved: 'Limits saved',
  },
);

// The buyer's card (design: BuyerCard): HCE activation, what is left today, and the two limits.
export default function CardScreen() {
  const { buyerId } = useSession();
  const { data: buyer, error, loading, reload } = useApi<BuyerView>(`/buyers/${buyerId}`);
  return (
    <Screen>
      <LoadState loading={loading} error={error} hasData={buyer !== undefined} onRetry={reload} />
      {buyer && <Card buyer={buyer} onSaved={reload} />}
    </Screen>
  );
}

function Card({ buyer, onSaved }: { buyer: BuyerView; onSaved: () => void }) {
  const { debugLabels } = useSession();
  const theme = useTheme();
  const colors = roleColors(theme, 'buyer');
  const t = useCopy(copy);
  const [payload, setPayload] = useState(() => NfcTap?.getCardPayload() ?? null);
  // shortcut: without the NfcTap native module (SDD §6) a debug-only local flag stands in for setCardPayload; drop it with P8.
  const [simulated, setSimulated] = useState(false);
  const simulating = !NfcTap && debugLabels;
  const active = NfcTap ? payload === buyer.walletAddress : simulating && simulated;
  const hce = NfcTap ? NfcTap.isHceSupported() : simulating;
  const reason = !buyer.hasGrant ? t.noGrant : hce ? null : NfcTap ? t.noHce : t.noModule;

  const setActive = (on: boolean) => {
    if (!NfcTap) {
      setSimulated(on);
      return;
    }
    NfcTap.setCardPayload(on ? buyer.walletAddress : null);
    setPayload(NfcTap.getCardPayload());
  };

  return (
    <>
      <View
        accessible
        accessibilityLabel={`${t.walletLabel(buyer.assetCode)}, ${buyer.name}, ${active ? t.on : t.off}`}
        style={[styles.card, { backgroundColor: active ? Fill.buyer : Brand.postgres }]}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t.walletLabel(buyer.assetCode)}</Text>
          <MaterialCommunityIcons name="contactless-payment" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.cardWallet} numberOfLines={1}>
          {buyer.walletAddress.replace(/^https?:\/\//, '')}
        </Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardName}>{buyer.name}</Text>
          <View style={styles.cardState}>
            <Text style={styles.cardLabel}>{active ? t.on : t.off}</Text>
          </View>
        </View>
      </View>

      {active ? (
        <View style={styles.section} accessibilityLiveRegion="polite">
          <ThemedText style={styles.isCard}>{t.isCard}</ThemedText>
          <StatusPill tone="ok" label={t.hce} />
          <ThemedText type="caption">{t.screenOn}</ThemedText>
          <BigButton label={t.deactivate} color={colors.ink} ghost onPress={() => setActive(false)} />
        </View>
      ) : (
        <View style={styles.section}>
          <BigButton label={t.activate} color={Fill.buyer} disabled={reason !== null} onPress={() => setActive(true)} />
          <ThemedText type="caption">{t.needs}</ThemedText>
          {reason && <StatusPill tone="neutral" label={reason} />}
        </View>
      )}
      {simulating && <StatusPill tone="wait" label={t.simulated} />}

      <LeftToday buyer={buyer} />
      <Limits buyer={buyer} onSaved={onSaved} />
    </>
  );
}

function LeftToday({ buyer }: { buyer: BuyerView }) {
  const theme = useTheme();
  const t = useCopy(copy);
  const lang = useLang();
  const daily = Number(buyer.dailyLimit);
  // Display only: a float is fine for a bar width, never for the amounts themselves.
  const used = daily > 0 ? Math.min(1, Number(buyer.spentToday) / daily) : 0;
  const plain = formatMoney(buyer.spentToday, buyer.assetScale, '', lang).trimEnd();
  return (
    <ThemedView card>
      <ThemedText type="caption" style={styles.sectionLabel}>
        {t.leftToday}
      </ThemedText>
      <Text style={[styles.big, { color: theme.text }]}>
        {formatMoney(buyer.remainingToday, buyer.assetScale, buyer.assetCode, lang)}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t.usedAria}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(used * 100) }}
        style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={[styles.bar, { width: `${used * 100}%` }]} />
      </View>
      <ThemedText type="caption">
        {t.used(plain, formatMoney(buyer.dailyLimit, buyer.assetScale, buyer.assetCode, lang))}
      </ThemedText>
    </ThemedView>
  );
}

type SaveStatus = { ok: true } | { ok: false; message: string } | null;

function Limits({ buyer, onSaved }: { buyer: BuyerView; onSaved: () => void }) {
  const t = useCopy(copy);
  // null shows what the service has; a string is an unsaved edit in the smallest unit.
  const [per, setPer] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [saving, setSaving] = useState(false);
  const perDigits = per ?? buyer.perPaymentLimit;
  const dayDigits = day ?? buyer.dailyLimit;

  const save = async () => {
    setSaving(true);
    try {
      await api<BuyerView>(`/buyers/${buyer.id}/limits`, {
        method: 'PATCH',
        body: { perPaymentLimit: perDigits, dailyLimit: dayDigits },
      });
      setStatus({ ok: true });
      onSaved();
    } catch (e) {
      // The service's VALIDATION message (e.g. "perPaymentLimit must be ≤ dailyLimit") is shown as it comes.
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setStatus(null);
  };

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {t.limits}
      </ThemedText>
      <LimitField label={t.perPayment} digits={perDigits} buyer={buyer} onChange={edit(setPer)} />
      <LimitField label={t.daily} digits={dayDigits} buyer={buyer} onChange={edit(setDay)} />
      <ThemedText type="caption">{t.units(perDigits, dayDigits)}</ThemedText>
      <BigButton label={t.save} color={Fill.buyer} disabled={saving} onPress={save} />
      <View accessibilityLiveRegion="polite">
        {status?.ok && <StatusPill tone="ok" label={t.saved} />}
        {status && !status.ok && <StatusPill tone="bad" label={status.message} />}
      </View>
    </View>
  );
}

type LimitFieldProps = { label: string; digits: string; buyer: BuyerView; onChange: (digits: string) => void };

// Cents-shift entry: only the digits typed count, so the keyboard's decimal key or locale can never move the comma.
function LimitField({ label, digits, buyer, onChange }: LimitFieldProps) {
  const theme = useTheme();
  const lang = useLang();
  return (
    <View style={styles.field}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <View style={[styles.inputBox, { borderColor: theme.border }]}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={formatMoney(digits, buyer.assetScale, '', lang).trimEnd()}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')}
          style={[styles.input, { color: theme.text }]}
        />
        <Text style={[styles.unit, { color: theme.muted }]}>{buyer.assetCode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { height: 168, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 20, justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardWallet: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'monospace' },
  cardName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  cardState: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  section: { gap: 10 },
  isCard: { fontSize: 19, fontWeight: '800' },
  sectionLabel: { fontWeight: '700' },
  big: { fontSize: 36, lineHeight: 42, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5, backgroundColor: Brand.buyer },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 48, fontSize: 20, fontWeight: '700' },
  unit: { fontSize: 15, fontWeight: '700' },
});
