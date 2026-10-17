import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Brand, Fills } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];

// The pieces of the vendor's charge flow (design: Cobrar to Sin confirmar). Shared components stay untouched: this is
// BigButton with a leading icon, plus the flow's own circles, steps and lists.

export function SaleButton({
  label,
  icon,
  ghost = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: Icon;
  ghost?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = ghost ? theme.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        ghost ? { borderColor: theme.text, borderWidth: 2 } : { backgroundColor: Fills.primary },
        { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}>
      {icon && <MaterialCommunityIcons name={icon} size={22} color={color} />}
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// An outcome's header: the icon on a coloured circle with a soft halo, then the title, the amount and a note.
export function OutcomeHead({
  icon,
  color,
  iconColor = '#FFFFFF',
  halo = color,
  title,
  titleColor,
  amount,
  note,
}: {
  icon: Icon;
  color: string;
  iconColor?: string;
  halo?: string;
  title: string;
  titleColor: string;
  amount: string;
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.head}>
      <View style={styles.haloBox}>
        <View style={[StyleSheet.absoluteFill, styles.halo, { backgroundColor: halo }]} />
        <View style={[styles.circle, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={icon} size={60} color={iconColor} />
        </View>
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.title, { color: titleColor }]}>
        {title}
      </Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, { color: theme.text }]}>
        {amount}
      </Text>
      {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}
    </View>
  );
}

// The contactless circle while a tap is awaited; the halo behind it breathes (design: Esperando toque).
export function Pulse() {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const breathe = (toValue: number) =>
      Animated.timing(scale, { toValue, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([breathe(1.2), breathe(1)]));
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={styles.pulseBox}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.pulseHalo, { backgroundColor: theme.primaryTint, transform: [{ scale }] }]}
      />
      <View style={[styles.pulseCircle, { backgroundColor: theme.primaryTint }]}>
        <MaterialCommunityIcons name="contactless-payment" size={88} color={theme.primaryInk} />
      </View>
    </View>
  );
}

export type Step = { label: string; detail?: string; state: 'done' | 'current' | 'pending' };

// The charge's progress card: a check for what happened, a teal ring for what is running, a grey one for what waits.
export function Steps({ items }: { items: Step[] }) {
  const theme = useTheme();
  return (
    <ThemedView card>
      {items.map((step) => (
        <View key={step.label} accessibilityState={{ checked: step.state === 'done' }} style={styles.row}>
          {step.state === 'done' ? (
            <View style={[styles.mark, { backgroundColor: Fills.income }]}>
              <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
            </View>
          ) : (
            <View style={[styles.mark, styles.ring, { borderColor: step.state === 'current' ? Brand.teal : theme.idle }]} />
          )}
          <Text style={[styles.stepText, { color: step.state === 'pending' ? theme.muted : theme.text }]}>
            {step.label}
            {step.detail ? <Text style={styles.stepDetail}> · {step.detail}</Text> : null}
          </Text>
        </View>
      ))}
    </ThemedView>
  );
}

export function Numbered({ items }: { items: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.list}>
      {items.map((text, i) => (
        <View key={text} style={styles.row}>
          <View style={[styles.mark, { backgroundColor: theme.primaryTint }]}>
            <Text style={[styles.number, { color: theme.primaryInk }]}>{i + 1}</Text>
          </View>
          <Text style={[styles.item, { color: theme.text }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 18, fontWeight: '600' },
  head: { alignItems: 'center', gap: 4 },
  haloBox: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  halo: { borderRadius: 72, opacity: 0.18 },
  circle: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  amount: { fontSize: 44, lineHeight: 52, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  note: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  pulseBox: { width: 200, height: 200, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  pulseHalo: { borderRadius: 100, opacity: 0.6 },
  pulseCircle: { width: 152, height: 152, borderRadius: 76, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  stepDetail: { fontWeight: '400' },
  list: { gap: 10 },
  number: { fontSize: 13, fontWeight: '700' },
  item: { flex: 1, fontSize: 16, lineHeight: 24 },
});
