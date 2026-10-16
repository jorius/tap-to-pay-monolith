import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Bar = { key: string; label: string; total: number };

const HEIGHT = 120;

// Bars scale to the busiest bucket; an empty bucket keeps a 4 px stub in the idle colour (design: Ventas por hora).
export function BarChart({ bars, accessibilityLabel }: { bars: Bar[]; accessibilityLabel: string }) {
  const theme = useTheme();
  const max = Math.max(0, ...bars.map((bar) => bar.total));
  const gap = bars.length > 12 ? 2 : 6;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.root}>
      <View style={[styles.bars, { gap }]}>
        {bars.map((bar) => (
          <View
            key={bar.key}
            style={[
              styles.bar,
              {
                height: max ? Math.max(4, Math.round((bar.total / max) * HEIGHT)) : 4,
                backgroundColor: bar.total ? Brand.vendor : theme.idle,
              },
            ]}
          />
        ))}
      </View>
      <View style={[styles.labels, { gap }]}>
        {bars.map((bar) => (
          <Text key={bar.key} numberOfLines={1} style={[styles.label, { color: theme.muted }]}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  bars: { height: HEIGHT, flexDirection: 'row', alignItems: 'flex-end' },
  bar: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  labels: { flexDirection: 'row' },
  label: { flex: 1, fontSize: 11, textAlign: 'center' },
});
