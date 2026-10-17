import { StyleSheet, Text, View } from 'react-native';

import { Fills } from '@/constants/theme';

// Solid fills under white text, so the 4.5:1 contrast holds in light and dark mode alike.
const TONES = {
  wait: Fills.pending,
  ok: Fills.income,
  bad: Fills.outflow,
  neutral: Fills.refused,
} as const;

export function StatusPill({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  return (
    <View style={[styles.pill, { backgroundColor: TONES[tone] }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
