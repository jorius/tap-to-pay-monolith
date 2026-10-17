import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { buyerAmount, formatMoney } from '@/api/money';
import type { VendorSaleView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { vendorCopy } from '@/components/vendor/copy';
import { failureText, STATUS_TONE, time } from '@/components/vendor/format';
import { Fill } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    sale: 'Venta',
    payment: 'Pago de servicio',
    payee: 'Servicio',
    concept: 'Concepto',
    created: 'Creada',
    paidAt: 'Pagada',
    buyer: 'Comprador',
    saleId: 'ID de venta',
    copyHint: 'Mantén presionado el ID para copiarlo.',
    privacy: 'Por seguridad no mostramos las URLs de la billetera (SDD §9).',
    close: 'Cerrar',
  },
  {
    sale: 'Sale',
    payment: 'Bill payment',
    payee: 'Service',
    concept: 'For',
    created: 'Created',
    paidAt: 'Paid',
    buyer: 'Buyer',
    saleId: 'Sale ID',
    copyHint: 'Long-press the ID to copy it.',
    privacy: 'For safety, wallet URLs are never shown (SDD §9).',
    close: 'Close',
  },
);

// Detail of one sale (design: the Movimientos sheet).
export function SaleSheet({ sale, onClose }: { sale: VendorSaleView | null; onClose: () => void }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);

  return (
    <Modal visible={sale !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityLabel={t.close} onPress={onClose} style={styles.backdrop} />
        {sale && (
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                {sale.direction === 'OUT' ? t.payment : t.sale}
              </Text>
              <StatusPill tone={STATUS_TONE[sale.status]} label={v.status[sale.status]} />
            </View>
            <Text style={[styles.amount, { color: theme.text }]}>
              {sale.direction === 'OUT' ? `− ${buyerAmount(sale, lang)}` : formatMoney(sale.amount, sale.assetScale, sale.assetCode, lang)}
            </Text>
            {sale.status === 'FAILED' && (
              <View style={[styles.failure, { backgroundColor: theme.badTint }]}>
                <Text style={[styles.failureText, { color: theme.text }]}>{failureText(sale, v.failure, lang)}</Text>
                {sale.failureCode && <Text style={[styles.code, { color: theme.muted }]}>{sale.failureCode}</Text>}
              </View>
            )}
            <Row label={t.created} value={time(sale.createdAt, lang, true)} />
            <Row label={t.paidAt} value={sale.paidAt ? time(sale.paidAt, lang, true) : '—'} />
            {sale.direction === 'OUT' ? (
              <Row label={t.payee} value={sale.payeeName ?? '—'} />
            ) : (
              <Row label={t.buyer} value={sale.buyerName ?? v.unregistered} />
            )}
            {sale.description ? <Row label={t.concept} value={sale.description} /> : null}
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.muted }]}>{t.saleId}</Text>
              <Text selectable style={[styles.code, styles.value, { color: theme.text }]}>
                {sale.id}
              </Text>
            </View>
            <Text style={[styles.note, { color: theme.muted }]}>
              {t.copyHint} {t.privacy}
            </Text>
            <BigButton label={t.close} color={Fill.vendor} onPress={onClose} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { padding: 20, paddingTop: 10, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  amount: { fontSize: 36, lineHeight: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
  failure: { gap: 4, padding: 12, borderRadius: 12 },
  failureText: { fontSize: 15, fontWeight: '600' },
  code: { fontFamily: 'monospace', fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { fontSize: 14 },
  value: { flexShrink: 1, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 17 },
});
