import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nextDigits } from '@/components/vendor/format';
import { useTheme } from '@/hooks/use-theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['000', '0', 'del'],
];

// The digits are whole units (the sale screen converts them with toMinor), so 000 adds the thousands in one press.
// Fills the height its parent leaves it: the rows and keys stretch, never below a 44 dp touch target.
export function Keypad({ digits, onChange, deleteLabel }: { digits: string; onChange: (digits: string) => void; deleteLabel: string }) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? deleteLabel : key}
              onPress={() => onChange(nextDigits(digits, key))}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? theme.primaryTint : theme.surface, borderColor: theme.border },
              ]}>
              {key === 'del' ? (
                <MaterialCommunityIcons name="backspace-outline" size={24} color={theme.text} />
              ) : (
                <Text style={[styles.label, { color: theme.text }]}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, gap: 8 },
  row: { flex: 1, flexDirection: 'row', gap: 8 },
  key: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
