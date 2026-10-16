import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { ThemedText } from '@/components/themed-text';
import { appRole } from '@/config/role';
import { Brand, roleColors } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

const copy = defineCopy(
  {
    vendor: {
      h1: 'Tu teléfono es la terminal',
      body: 'Cobra con un toque: el cliente acerca su teléfono y el pago llega a tu billetera Interledger.',
      evidence: 'Cada venta digital queda registrada y construye un historial de tu negocio que tú controlas.',
      points: ['Sin datáfono ni tarjetas', 'De billetera a billetera con Open Payments', 'Tus ventas del día, siempre a la mano'],
      amount: '12,00',
    },
    buyer: {
      h1: 'Tu teléfono es tu tarjeta',
      body: 'Paga con un toque desde tu billetera Interledger, con los topes que tú defines.',
      points: [
        'Autorizas una sola vez; después cada pago es un toque',
        'Topes por pago y por día, siempre a tu medida',
        'Sin llaves ni contraseñas guardadas en el teléfono',
      ],
      cardLabel: 'Tu tarjeta',
    },
    cta: 'Comenzar',
    lang: 'Idioma: español · puedes cambiarlo en Ajustes',
  },
  {
    vendor: {
      h1: 'Your phone is the terminal',
      body: 'Charge with one tap: the customer holds their phone to yours and the money lands in your Interledger wallet.',
      evidence: 'Every digital sale is recorded and builds a history of your business that you control.',
      points: ['No card reader, no cards', 'Wallet to wallet with Open Payments', "Today's sales, always at hand"],
      amount: '12.00',
    },
    buyer: {
      h1: 'Your phone is your card',
      body: 'Pay with one tap from your Interledger wallet, within the limits you set.',
      points: [
        'Authorize once; after that every payment is a tap',
        'Per-payment and daily limits, set by you',
        'No keys or passwords stored on the phone',
      ],
      cardLabel: 'Your card',
    },
    cta: 'Get started',
    lang: 'Language: English · change it in Settings',
  },
);

// First launch of a role-locked build (design: VendorWelcome, BuyerWelcome); the entry gate never shows it again.
export default function Welcome() {
  const role = appRole ?? 'vendor';
  const router = useRouter();
  const { update } = useSession();
  const theme = useTheme();
  const colors = roleColors(theme, role);
  const t = useCopy(copy);
  const appName = useCopy(commonCopy).appName[role];
  const content = role === 'vendor' ? t.vendor : t.buyer;

  const start = () => {
    update({ welcomeSeen: true });
    router.replace(role === 'vendor' ? '/vendor' : '/buyer');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: colors.brand }]}>
            <MaterialCommunityIcons
              name={role === 'vendor' ? 'contactless-payment' : 'credit-card-outline'}
              size={22}
              color="#FFFFFF"
            />
          </View>
          <Text style={[styles.appName, { color: theme.text }]}>{appName}</Text>
        </View>

        <View importantForAccessibility="no-hide-descendants" style={[styles.hero, { backgroundColor: colors.tint }]}>
          {role === 'vendor' ? (
            <>
              <View style={[styles.phone, { borderColor: theme.text }]}>
                <Text style={[styles.phoneAmount, { color: theme.text }]}>{t.vendor.amount}</Text>
              </View>
              <MaterialCommunityIcons name="contactless-payment" size={56} color={Brand.vendor} />
              <View style={[styles.phone, { borderColor: theme.muted }]}>
                <MaterialCommunityIcons name="credit-card-outline" size={30} color={theme.muted} />
              </View>
            </>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.fill }]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardLabel}>{t.buyer.cardLabel}</Text>
                <MaterialCommunityIcons name="contactless-payment" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.cardWallet}>ilp.interledger-test.dev/ana</Text>
              <Text style={styles.cardLabel}>USD</Text>
            </View>
          )}
        </View>

        <View style={styles.copy}>
          <ThemedText type="title" accessibilityRole="header">
            {content.h1}
          </ThemedText>
          <ThemedText style={{ color: theme.muted }}>{content.body}</ThemedText>
        </View>

        {role === 'vendor' && (
          <View style={[styles.evidence, { backgroundColor: theme.card }]}>
            <MaterialCommunityIcons name="chart-bar" size={22} color={colors.ink} />
            <ThemedText style={styles.evidenceText}>{t.vendor.evidence}</ThemedText>
          </View>
        )}

        <View style={styles.points}>
          {content.points.map((point) => (
            <View key={point} style={styles.point}>
              <MaterialCommunityIcons name="check" size={20} color={theme.okInk} />
              <ThemedText style={styles.pointText}>{point}</ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <BigButton label={t.cta} color={colors.fill} onPress={start} />
          <ThemedText type="caption" style={styles.center}>
            {t.lang}
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  appName: { fontSize: 16, fontWeight: '800' },
  hero: { height: 176, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  phone: { width: 70, height: 124, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  phoneAmount: { fontSize: 15, fontWeight: '800' },
  card: { width: 236, height: 140, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardWallet: { color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace' },
  copy: { gap: 10 },
  evidence: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 },
  evidenceText: { flex: 1, fontSize: 15, lineHeight: 22 },
  points: { gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 21 },
  footer: { marginTop: 'auto', gap: 12 },
  center: { textAlign: 'center' },
});
