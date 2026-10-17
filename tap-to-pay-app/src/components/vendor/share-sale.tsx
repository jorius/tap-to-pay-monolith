import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { apiUrl } from '@/api/client';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { errorText, fill, time } from '@/components/vendor/format';
import { roleColors } from '@/constants/theme';
import { usePaymentLink } from '@/hooks/use-payment-link';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    or: 'O cóbralo sin NFC',
    qr: 'Mostrar QR',
    hideQr: 'Ocultar QR',
    whatsapp: 'WhatsApp',
    share: 'Compartir',
    scan: 'El cliente lo escanea desde la app: Tarjeta → Pagar con QR o link',
    expires: 'El link vence a las {time}',
    noWhatsapp: 'No se pudo abrir WhatsApp: usa Compartir.',
  },
  {
    or: 'Or charge it without NFC',
    qr: 'Show QR',
    hideQr: 'Hide QR',
    whatsapp: 'WhatsApp',
    share: 'Share',
    scan: 'The customer scans it in the app: Card → Pay with a QR or link',
    expires: 'The link expires at {time}',
    noWhatsapp: "Couldn't open WhatsApp: use Share.",
  },
);

// While a sale waits for a tap, the vendor can also show it as a QR or send its link by WhatsApp or any other app. The
// terminal keeps watching the sale, so a payment through the link ends on the same Paid screen as a tap.
export function ShareSale({ saleId }: { saleId: string }) {
  const theme = useTheme();
  const lang = useLang();
  const t = useCopy(copy);
  const v = useCopy(vendorCopy);
  const colors = roleColors(theme, 'vendor');
  const { link, error, loading, ensure } = usePaymentLink(saleId, lang);
  const [showQr, setShowQr] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleQr = async () => {
    if (showQr) return setShowQr(false);
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

  const share = async () => {
    const created = await ensure();
    if (created) await Share.share({ message: created.message }).catch(() => {});
  };

  return (
    <ThemedView card>
      <ThemedText type="caption">{t.or}</ThemedText>
      <View style={styles.row}>
        <Action icon="qrcode" label={showQr ? t.hideQr : t.qr} color={colors.ink} onPress={toggleQr} />
        <Action icon="whatsapp" label={t.whatsapp} color={colors.ink} onPress={whatsapp} />
        <Action icon="share-variant" label={t.share} color={colors.ink} onPress={share} />
      </View>
      {loading && <ActivityIndicator color={colors.brand} />}
      {error && <StatusPill tone="bad" label={errorText(error, v.network)} />}
      {notice && <ThemedText type="caption">{notice}</ThemedText>}
      {showQr && link && (
        <View style={styles.qrBox}>
          {/* The vendor's phone always reaches the service at apiUrl; the QR's content is the shareable link. */}
          <Image
            source={{ uri: `${apiUrl}/pay/${link.code}/qr.svg` }}
            style={styles.qr}
            contentFit="contain"
            accessibilityLabel={link.url}
          />
          <ThemedText type="caption" style={styles.center}>
            {t.scan}
          </ThemedText>
        </View>
      )}
      {link && (
        <ThemedText type="caption" style={styles.center}>
          {fill(t.expires, { time: time(link.expiresAt, lang) })}
        </ThemedText>
      )}
    </ThemedView>
  );
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
  qrBox: { alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  qr: { width: 240, height: 240 },
  center: { textAlign: 'center' },
});
