import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// A small label: filled (white text unless `ink` says otherwise), or outlined in the border colour.
export function Chip({ label, fill, ink }: { label: string; fill?: string; ink?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, fill ? { backgroundColor: fill } : { borderWidth: 1, borderColor: theme.border }]}>
      <Text style={[styles.label, { color: ink ?? (fill ? '#FFFFFF' : theme.text) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 10 },
  label: { fontSize: 12, fontWeight: '600' },
});
