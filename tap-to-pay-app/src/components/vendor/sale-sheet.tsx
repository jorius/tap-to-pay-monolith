import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/money';
import type { VendorSaleView, VendorWalletView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { vendorCopy } from '@/components/vendor/copy';
import { failureText, fill, locale, STATUS_TONE, time } from '@/components/vendor/format';
import { walletName } from '@/components/vendor/wallets';
import { Fills } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang, type Lang } from '@/i18n';

const copy = defineCopy(
  {
    from: 'de {name}',
    when: 'Cuándo',
    today: 'Hoy',
    yesterday: 'Ayer',
    how: 'Cómo pagó',
    tap: 'Con un toque',
    landed: 'Llegó a',
    removedWallet: 'Billetera retirada',
    code: 'Código',
    receipt: 'Comprobante Paynela',
    share: 'Enviar comprobante',
    close: 'Cerrar',
  },
  {
    from: 'from {name}',
    when: 'When',
    today: 'Today',
    yesterday: 'Yesterday',
    how: 'How they paid',
    tap: 'With a tap',
    landed: 'Landed in',
    removedWallet: 'Removed wallet',
    code: 'Code',
    receipt: 'Paynela receipt',
    share: 'Send receipt',
    close: 'Close',
  },
);

type Props = { sale: VendorSaleView | null; wallets: VendorWalletView[]; onClose: () => void };

// Detail of one sale (design: Detalle de venta): the outcome, the amount, who paid, and a receipt to share.
export function SaleSheet({ sale, wallets, onClose }: Props) {
  const t = useCopy(copy);
  return (
    <Modal visible={sale !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityLabel={t.close} onPress={onClose} style={styles.backdrop} />
        {sale && <Detail sale={sale} wallets={wallets} onClose={onClose} />}
      </View>
    </Modal>
  );
}

function Detail({ sale, wallets, onClose }: Props & { sale: VendorSaleView }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const failed = sale.status === 'FAILED';
  const amount = formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang);
  const from = fill(t.from, { name: sale.buyerName ?? v.unregistered });
  const wallet = wallets.find((w) => w.id === sale.vendorWalletId);
  const reason = failed ? failureText(sale, v.failure, lang) : '';
  const rows: [string, string][] = [
    [t.when, when(sale.paidAt ?? sale.createdAt, lang, t)],
    [t.how, t.tap],
    [t.landed, wallet ? walletName(wallet, v.walletNamed) : t.removedWallet],
    [t.code, `VT-${sale.id.slice(-4).toUpperCase()}`],
  ];
  const share = () =>
    Share.share({
      message: [t.receipt, `${v.outcome[sale.status]} · ${amount} ${from}`, reason, ...rows.map(([label, value]) => `${label}: ${value}`)]
        .filter(Boolean)
        .join('\n'),
    }).catch(() => {});

  return (
    <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface }]}>
      <View style={[styles.handle, { backgroundColor: theme.border }]} />
      <View style={styles.center}>
        <StatusPill tone={STATUS_TONE[sale.status]} label={v.outcome[sale.status]} />
        {/* A refused sale moved no money: its amount is struck through in grey (Paynela design system). */}
        <Text style={[styles.amount, { color: failed ? theme.refused : theme.text }, failed && styles.struck]}>{amount}</Text>
        <Text style={[styles.from, { color: theme.muted }]}>{from}</Text>
      </View>
      {reason ? (
        <View style={[styles.reason, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={[styles.reasonText, { color: theme.text }]}>{reason}</Text>
        </View>
      ) : null}
      <View>
        {rows.map(([label, value]) => (
          <View key={label} style={[styles.row, { borderTopColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
            <Text selectable style={[styles.value, { color: theme.text }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <BigButton label={t.share} color={Fills.primary} onPress={share} />
      <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.closeText, { color: theme.text }]}>{t.close}</Text>
      </Pressable>
    </View>
  );
}

// "Hoy, 18:46", "Ayer, 09:10", else "3 oct, 09:10", on the phone's clock.
function when(iso: string, lang: Lang, t: { today: string; yesterday: string }) {
  const date = new Date(iso);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);
  const day = days === 0 ? t.today : days === 1 ? t.yesterday : date.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' });
  return `${day}, ${time(iso, lang)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { padding: 20, paddingTop: 10, gap: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  center: { alignItems: 'center', gap: 8 },
  amount: { fontSize: 40, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through' },
  from: { fontSize: 16 },
  reason: { padding: 12, borderRadius: 12, borderWidth: 1 },
  reasonText: { fontSize: 15, fontWeight: '600' },
  row: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTopWidth: 1 },
  label: { fontSize: 15 },
  value: { flexShrink: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 16, fontWeight: '600' },
});
