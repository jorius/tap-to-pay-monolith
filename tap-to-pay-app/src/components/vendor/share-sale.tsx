import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiUrl } from '@/api/client';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { errorText, fill, time } from '@/components/vendor/format';
import { Fill, roleColors } from '@/constants/theme';
import { usePaymentLink } from '@/hooks/use-payment-link';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    or: 'O cóbralo sin NFC',
    qr: 'Mostrar QR',
    qrTitle: 'Escanea para pagar',
    close: 'Cerrar',
    whatsapp: 'WhatsApp',
    share: 'Compartir',
    scan: 'El cliente lo escanea desde la app: Tarjeta → Pagar con QR o link',
    expires: 'El link vence a las {time}',
    noWhatsapp: 'No se pudo abrir WhatsApp: usa Compartir.',
    phone: 'Enviar al WhatsApp del cliente',
    phonePlaceholder: 'Celular, ej. 300 123 4567',
    phoneHint: 'Un celular colombiano de 10 dígitos lleva el +57 solo; otro país, escríbelo con su código.',
    send: 'Enviar',
    badPhone: 'Escribe un número válido: 10 dígitos, o con el código del país.',
  },
  {
    or: 'Or charge it without NFC',
    qr: 'Show QR',
    qrTitle: 'Scan to pay',
    close: 'Close',
    whatsapp: 'WhatsApp',
    share: 'Share',
    scan: 'The customer scans it in the app: Card → Pay with a QR or link',
    expires: 'The link expires at {time}',
    noWhatsapp: "Couldn't open WhatsApp: use Share.",
    phone: "Send to the customer's WhatsApp",
    phonePlaceholder: 'Mobile, e.g. 300 123 4567',
    phoneHint: 'A 10-digit Colombian mobile gets +57 added; for another country type its code.',
    send: 'Send',
    badPhone: 'Type a valid number: 10 digits, or with the country code.',
  },
);

// While a sale waits for a tap, the vendor can also show it as a QR or send its link by WhatsApp or any other app. The
// terminal keeps watching the sale, so a payment through the link ends on the same Paid screen as a tap; this component
// then unmounts, which also closes the QR modal. `amount` is the sale's amount as the terminal shows it.
export function ShareSale({ saleId, amount }: { saleId: string; amount: string }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const colors = roleColors(theme, 'vendor');
  const { link, error, loading, ensure } = usePaymentLink(saleId, lang);
  const [showQr, setShowQr] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const openQr = async () => {
    if (await ensure()) setShowQr(true);
  };

  const whatsapp = async () => {
    const created = await ensure();
    if (!created) return;
    setNotice(null);
    try {
      await Linking.openURL(created.whatsappUrl);
    } catch {
      setNotice(t.noWhatsapp);
    }
  };

  const [phone, setPhone] = useState('');
  const sendTo = async () => {
    const digits = whatsappNumber(phone);
    if (!digits) return setNotice(t.badPhone);
    const created = await ensure();
    if (!created) return;
    setNotice(null);
    try {
      // Straight into that chat, with the message written: the vendor only taps send.
      await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(created.message)}`);
    } catch {
      setNotice(t.noWhatsapp);
    }
  };

  const share = async () => {
    const created = await ensure();
    if (created) await Share.share({ message: created.message }).catch(() => {});
  };

  return (
    <ThemedView card>
      <ThemedText type="caption">{t.or}</ThemedText>
      <View style={styles.row}>
        <Action icon="qrcode" label={t.qr} color={colors.ink} onPress={openQr} />
        <Action icon="whatsapp" label={t.whatsapp} color={colors.ink} onPress={whatsapp} />
        <Action icon="share-variant" label={t.share} color={colors.ink} onPress={share} />
      </View>
      <ThemedText type="caption">{t.phone}</ThemedText>
      <View style={styles.row}>
        <TextInput
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setNotice(null);
          }}
          placeholder={t.phonePlaceholder}
          placeholderTextColor={theme.muted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.send}
          disabled={!phone.trim()}
          onPress={sendTo}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: colors.fill, opacity: !phone.trim() ? 0.4 : pressed ? 0.8 : 1 },
          ]}>
          <MaterialCommunityIcons name="whatsapp" size={22} color="#FFFFFF" />
          <Text style={styles.sendLabel}>{t.send}</Text>
        </Pressable>
      </View>
      <ThemedText type="caption">{t.phoneHint}</ThemedText>
      {loading && <ActivityIndicator color={colors.brand} />}
      {error && <StatusPill tone="bad" label={errorText(error, v.network)} />}
      {notice && <ThemedText type="caption">{notice}</ThemedText>}
      {link && (
        <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowQr(false)} accessibilityLabel={t.close}>
            {/* A tap inside the card does not close it; only the backdrop and Close do. */}
            <Pressable accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.background }]}>
              <Text style={[styles.qrTitle, { color: theme.text }]}>{t.qrTitle}</Text>
              <Text style={[styles.qrAmount, { color: theme.text }]}>{amount}</Text>
              <View style={styles.qrBox}>
                {/* The vendor's phone always reaches the service at apiUrl; the QR's content is the shareable link. */}
                <Image
                  source={{ uri: `${apiUrl}/pay/${link.code}/qr.svg` }}
                  style={styles.qr}
                  contentFit="contain"
                  accessibilityLabel={link.url}
                />
              </View>
              <ThemedText type="caption" style={styles.center}>
                {t.scan}
              </ThemedText>
              <ThemedText type="caption" style={styles.center}>
                {fill(t.expires, { time: time(link.expiresAt, lang) })}
              </ThemedText>
              <View style={styles.close}>
                <BigButton label={t.close} color={Fill.vendor} onPress={() => setShowQr(false)} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {link && (
        <ThemedText type="caption" style={styles.center}>
          {fill(t.expires, { time: time(link.expiresAt, lang) })}
        </ThemedText>
      )}
    </ThemedView>
  );
}

/**
 * The number wa.me expects: digits only, with the country code. A 10-digit number starting with 3 is a Colombian mobile
 * and gets 57; anything else must already carry its code (8 to 15 digits, as in E.164).
 */
export function whatsappNumber(input: string): string | null {
  const digits = input.replace(/[\s()+.-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

type ActionProps = {
  icon: 'qrcode' | 'whatsapp' | 'share-variant';
  label: string;
  color: string;
  onPress: () => void;
};

function Action({ icon, label, color, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: color, opacity: pressed ? 0.6 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={26} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
  // White behind the code in dark mode too, so any camera reads it.
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: { alignItems: 'center', gap: 10, borderRadius: 24, padding: 24 },
  qrTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  qrAmount: { fontSize: 32, lineHeight: 40, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  qrBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  qr: { width: 260, height: 260 },
  close: { alignSelf: 'stretch', marginTop: 4 },
  center: { textAlign: 'center' },
  input: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  send: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 16, minHeight: 52 },
  sendLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
