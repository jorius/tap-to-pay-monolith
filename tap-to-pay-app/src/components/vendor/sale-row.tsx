import { Pressable, StyleSheet, Text, View } from 'react-native';

import { buyerAmount, formatMoney } from '@/api/money';
import type { VendorSaleView } from '@/api/types';
import { StatusPill } from '@/components/status-pill';
import { vendorCopy } from '@/components/vendor/copy';
import { STATUS_TONE, time } from '@/components/vendor/format';
import { useTheme } from '@/hooks/use-theme';
import { useCopy, useLang } from '@/i18n';

// One sale in a list: time, amount, who paid (or the refusal code) and the status pill. Wallet URLs never appear.
export function SaleRow({ sale, onPress }: { sale: VendorSaleView; onPress?: () => void }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(vendorCopy);
  const out = sale.direction === 'OUT';
  // A payment out shows what left the vendor's wallet (the quote's debit), with a minus sign.
  const amount = out ? `− ${buyerAmount(sale, lang)}` : formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang);
  const who = [out ? t.paymentTo(sale.payeeName ?? '') : (sale.buyerName ?? t.unregistered), sale.failureCode]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.time, { color: theme.muted }]}>{time(sale.createdAt, lang)}</Text>
      <View style={styles.middle}>
        <Text style={[styles.amount, { color: out ? theme.muted : theme.text }]}>{amount}</Text>
        {onPress && (
          <Text numberOfLines={1} style={[styles.who, { color: theme.muted }]}>
            {who}
          </Text>
        )}
      </View>
      <View style={styles.pill}>
        <StatusPill tone={STATUS_TONE[sale.status]} label={t.status[sale.status]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  time: { width: 46, fontSize: 13, fontVariant: ['tabular-nums'] },
  middle: { flex: 1, gap: 2 },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  who: { fontSize: 13 },
  pill: { alignSelf: 'center' },
});
