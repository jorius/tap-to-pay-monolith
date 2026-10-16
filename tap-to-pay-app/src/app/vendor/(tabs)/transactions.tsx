import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SaleStatus, VendorSaleView, VendorView } from '@/api/types';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { FilterChips } from '@/components/vendor/chips';
import { fill, locale } from '@/components/vendor/format';
import { SaleRow } from '@/components/vendor/sale-row';
import { SaleSheet } from '@/components/vendor/sale-sheet';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { VendorGate } from '@/components/vendor/vendor-gate';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

type Filter = 'ALL' | Exclude<SaleStatus, 'AWAITING_TAP'>;

const copy = defineCopy(
  {
    statusFilter: 'Filtrar por estado',
    filters: { ALL: 'Todos', PAID: 'Pagados', CHARGING: 'Pendientes', FAILED: 'Fallidos' },
    today: 'Hoy',
    yesterday: 'Ayer',
    dateAria: 'Fecha: {date}',
    previous: 'Día anterior',
    next: 'Día siguiente',
    empty: 'No hay movimientos con este filtro.',
  },
  {
    statusFilter: 'Filter by status',
    filters: { ALL: 'All', PAID: 'Paid', CHARGING: 'Pending', FAILED: 'Failed' },
    today: 'Today',
    yesterday: 'Yesterday',
    dateAria: 'Date: {date}',
    previous: 'Previous day',
    next: 'Next day',
    empty: 'No transactions match this filter.',
  },
);

const FILTERS: Filter[] = ['ALL', 'PAID', 'CHARGING', 'FAILED'];

export default function TransactionsScreen() {
  return <VendorGate>{(vendor) => <Transactions vendor={vendor} />}</VendorGate>;
}

// The vendor's sales by status and day (design: Movimientos); a row opens its detail sheet.
function Transactions({ vendor }: { vendor: VendorView }) {
  const t = useCopy(copy);
  const lang = useLang();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [daysBack, setDaysBack] = useState(0);
  const day = localDay(daysBack);
  const query = `date=${day.iso}&limit=50${filter === 'ALL' ? '' : `&status=${filter}`}`;
  const label = daysBack === 0 ? t.today : daysBack === 1 ? t.yesterday : day.date.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' });

  return (
    <Screen>
      <FilterChips
        label={t.statusFilter}
        options={FILTERS.map((value) => ({ value, label: t.filters[value] }))}
        value={filter}
        onChange={setFilter}
      />
      <DayStepper
        label={label}
        aria={fill(t.dateAria, { date: label })}
        previous={t.previous}
        next={t.next}
        canGoForward={daysBack > 0}
        onStep={(step) => setDaysBack((n) => Math.max(0, n - step))}
      />
      {/* Keyed by query so a filter change shows a spinner instead of the previous filter's rows. */}
      <SalesList key={query} vendorId={vendor.id} query={query} empty={t.empty} />
    </Screen>
  );
}

function SalesList({ vendorId, query, empty }: { vendorId: string; query: string; empty: string }) {
  const { data, error, reload } = useApi<VendorSaleView[]>(`/vendors/${vendorId}/sales?${query}`);
  const [selected, setSelected] = useState<VendorSaleView | null>(null);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState />;
  return (
    <View>
      {data.length === 0 ? <ThemedText type="caption">{empty}</ThemedText> : null}
      {data.map((sale) => (
        <SaleRow key={sale.id} sale={sale} onPress={() => setSelected(sale)} />
      ))}
      <SaleSheet sale={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

type StepperProps = {
  label: string;
  aria: string;
  previous: string;
  next: string;
  canGoForward: boolean;
  onStep: (step: -1 | 1) => void;
};

function DayStepper({ label, aria, previous, next, canGoForward, onStep }: StepperProps) {
  const theme = useTheme();
  return (
    <View style={styles.stepper}>
      <StepButton icon="chevron-left" label={previous} onPress={() => onStep(-1)} />
      <View accessible accessibilityLabel={aria} style={[styles.day, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={theme.text} />
        <Text style={[styles.dayText, { color: theme.text }]}>{label}</Text>
      </View>
      <StepButton icon="chevron-right" label={next} disabled={!canGoForward} onPress={() => onStep(1)} />
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'chevron-left' | 'chevron-right'; label: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, { borderColor: theme.border, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

// shortcut: the day comes from the phone's clock and time zone, assumed to be DAILY_LIMIT_TZ (Bogotá); send the zone
// to the service if terminals ever run elsewhere.
function localDay(daysBack: number) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date, iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` };
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 },
  dayText: { fontSize: 14, fontWeight: '600' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
});
