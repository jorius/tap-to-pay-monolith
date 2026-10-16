import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

// Solid fills, so the 4.5:1 text contrast holds in light and dark mode alike.
const TONES = {
  wait: { backgroundColor: Brand.interledger, color: '#111827' },
  ok: { backgroundColor: Brand.ok, color: '#FFFFFF' },
  bad: { backgroundColor: Brand.bad, color: '#FFFFFF' },
  neutral: { backgroundColor: Brand.postgres, color: '#FFFFFF' },
} as const;

export function StatusPill({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  const { backgroundColor, color } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  label: { fontSize: 14, fontWeight: '600' },
});
