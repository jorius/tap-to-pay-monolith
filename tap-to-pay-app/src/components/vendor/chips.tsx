import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // A segmented control (Hoy · Semana · Mes): equal-width options in one track, the chosen one raised in white.
  segmented?: boolean;
};

// Single-choice pills (design: the status filters), or a segmented control with `segmented`.
export function FilterChips<T extends string>({ label, options, value, onChange, segmented = false }: Props<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={segmented ? [styles.track, { backgroundColor: theme.border }] : styles.row}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            hitSlop={4}
            onPress={() => onChange(option.value)}
            style={
              segmented
                ? [styles.segment, on && { backgroundColor: theme.surface }]
                : [
                    styles.chip,
                    on
                      ? { borderColor: theme.primaryInk, backgroundColor: theme.primaryTint }
                      : { borderColor: theme.border, backgroundColor: theme.surface },
                  ]
            }>
            <Text style={[styles.label, { color: on ? (segmented ? theme.text : theme.primaryInk) : segmented ? theme.muted : theme.text }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  track: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  label: { fontSize: 14, fontWeight: '600' },
});
