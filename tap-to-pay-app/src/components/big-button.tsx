import { Pressable, StyleSheet, Text } from 'react-native';

type Props = { label: string; color: string; ghost?: boolean; disabled?: boolean; onPress: () => void };

export function BigButton({ label, color, ghost = false, disabled = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        ghost ? { borderColor: color, borderWidth: 2 } : { backgroundColor: color },
        { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}>
      <Text style={[styles.label, { color: ghost ? color : '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 64, borderRadius: 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 20, fontWeight: '700' },
});
