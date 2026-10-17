import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { VendorSaleView } from '@/api/types';
import { Initials } from '@/components/buyer/initials';
import { vendorCopy } from '@/components/vendor/copy';
import { time } from '@/components/vendor/format';
import { useTheme } from '@/hooks/use-theme';
import { useCopy, useLang } from '@/i18n';

// One sale in a list (design: Mis ventas): who paid, when, and the amount on the right. Money in is "+" in green with
// no label; a refusal is struck through in grey and says "No pasó · why", so colour never carries the meaning alone.
export function SaleRow({ sale, onPress }: { sale: VendorSaleView; onPress?: () => void }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(vendorCopy);
  const name = sale.buyerName ?? t.unregistered;
  const paid = sale.status === 'PAID';
  const failed = sale.status === 'FAILED';
  const reason = sale.failureCode ? t.failureShort[sale.failureCode] : undefined;
  const note = failed ? [t.noPass, reason].filter(Boolean).join(' · ') : sale.status === 'CHARGING' ? t.outcome.CHARGING : null;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
      <Initials name={name} size={40} background={theme.border} color={theme.text} />
      <View style={styles.middle}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {name}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]}>{time(sale.createdAt, lang)}</Text>
      </View>
      <View style={styles.end}>
        <Text style={[styles.amount, { color: paid ? theme.income : failed ? theme.refused : theme.text }, failed && styles.struck]}>
          {paid ? '+' : ''}
          {formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang)}
        </Text>
        {note && <Text style={[styles.meta, { color: failed ? theme.refused : theme.muted }]}>{note}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  middle: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13, fontVariant: ['tabular-nums'] },
  end: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through' },
});
