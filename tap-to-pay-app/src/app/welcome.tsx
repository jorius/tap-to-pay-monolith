import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatMoney } from '@/api/money';
import { BigButton } from '@/components/big-button';
import { Logo } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { appRole } from '@/config/role';
import { Brand, Fills } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

const copy = defineCopy(
  {
    vendor: {
      h1: 'Cobra con tu celular',
      body: 'Tu cliente acerca su celular al tuyo y la plata te llega al instante.',
      points: ['Sin datáfono ni equipos extra', 'Cada venta queda anotada sola', 'Tus ventas arman el historial de tu negocio'],
    },
    buyer: {
      h1: 'Paga con tu celular',
      body: 'Lo acercas al celular del vendedor y listo. Sin efectivo ni tarjetas.',
      points: ['Un toque y pagaste', 'Tú pones el límite de cada compra', 'Tus claves no se guardan aquí'],
      cardLabel: 'Mi billetera',
      cardTagline: 'Tu celular es tu tarjeta',
    },
    cta: 'Empezar',
    lang: 'Español · cambiar idioma',
  },
  {
    vendor: {
      h1: 'Charge with your phone',
      body: 'Your customer holds their phone to yours and the money lands right away.',
      points: ['No card reader or extra gear', 'Every sale is written down by itself', "Your sales build your business's history"],
    },
    buyer: {
      h1: 'Pay with your phone',
      body: "Hold it to the seller's phone and you're done. No cash, no cards.",
      points: ["One tap and you've paid", 'You set the limit for each purchase', 'Your keys are never stored here'],
      cardLabel: 'My wallet',
      cardTagline: 'Your phone is your card',
    },
    cta: 'Get started',
    lang: 'English · change language',
  },
);

// First launch of a role-locked build (design: Bienvenida); the entry gate never shows it again.
export default function Welcome() {
  const role = appRole ?? 'vendor';
  const router = useRouter();
  const { lang, update } = useSession();
  const theme = useTheme();
  const t = useCopy(copy);
  const common = useCopy(commonCopy);
  const content = role === 'vendor' ? t.vendor : t.buyer;

  const start = () => {
    update({ welcomeSeen: true });
    // The entry gate picks who this phone is, so the tabs open straight away.
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo label={common.appName[role]} height={72} />

        <View importantForAccessibility="no-hide-descendants" style={[styles.hero, { backgroundColor: theme.primaryTint }]}>
          {role === 'vendor' ? (
            <>
              <View style={[styles.phone, { backgroundColor: theme.surface, borderColor: theme.text }]}>
                <Text style={[styles.phoneCaption, { color: theme.muted }]}>{common.tabs.sale}</Text>
                <Text style={[styles.phoneAmount, { color: theme.text }]}>{formatMoney('12000', 0, 'COP', lang)}</Text>
              </View>
              <MaterialCommunityIcons name="contactless-payment" size={44} color={theme.primaryInk} />
              <View style={[styles.phone, { backgroundColor: Fills.primary, borderColor: Brand.tealDark }]}>
                <MaterialCommunityIcons name="credit-card-outline" size={30} color="#FFFFFF" />
              </View>
            </>
          ) : (
            <View style={[styles.card, { backgroundColor: Fills.primary }]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardLabel}>{t.buyer.cardLabel}</Text>
                <MaterialCommunityIcons name="contactless-payment" size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTagline}>{t.buyer.cardTagline}</Text>
            </View>
          )}
        </View>

        <View style={styles.copy}>
          <ThemedText type="title" accessibilityRole="header">
            {content.h1}
          </ThemedText>
          <ThemedText style={{ color: theme.muted }}>{content.body}</ThemedText>
        </View>

        <View style={styles.points}>
          {content.points.map((point) => (
            <View key={point} style={styles.point}>
              <View style={[styles.check, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="check" size={18} color={theme.primaryInk} />
              </View>
              <ThemedText style={styles.pointText}>{point}</ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <BigButton label={t.cta} color={Fills.primary} onPress={start} />
          <Pressable accessibilityRole="button" onPress={() => update({ lang: lang === 'es' ? 'en' : 'es' })} style={styles.langLink}>
            <Text style={[styles.langText, { color: theme.primaryInk }]}>{t.lang}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  hero: { height: 220, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  phone: { width: 84, height: 150, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 4 },
  phoneCaption: { fontSize: 12, fontWeight: '600' },
  phoneAmount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  card: {
    width: 250,
    height: 150,
    borderRadius: 16,
    padding: 18,
    justifyContent: 'space-between',
    transform: [{ rotate: '-8deg' }],
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cardTagline: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  copy: { gap: 10 },
  points: { gap: 12 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: 16, lineHeight: 22 },
  footer: { marginTop: 'auto', gap: 8 },
  langLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  langText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
});
