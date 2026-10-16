import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nextDigits } from '@/components/vendor/format';
import { useTheme } from '@/hooks/use-theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', 'del'],
];

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
              style={({ pressed }) => [styles.key, { backgroundColor: theme.card, opacity: pressed ? 0.6 : 1 }]}>
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
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: { flex: 1, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 22, fontWeight: '700' },
});
