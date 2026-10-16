import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// Single-choice pills (design: Hoy · Semana · Mes, and the status filters).
export function FilterChips<T extends string>({ label, options, value, onChange }: Props<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            hitSlop={4}
            onPress={() => onChange(option.value)}
            style={[styles.chip, { borderColor: on ? theme.text : theme.border, backgroundColor: on ? theme.text : 'transparent' }]}>
            <Text style={[styles.label, { color: on ? theme.background : theme.text, fontWeight: on ? '700' : '600' }]}>
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
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 2 },
  label: { fontSize: 14 },
});
