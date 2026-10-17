import { StyleSheet, Text, View } from 'react-native';

type Props = { name: string; size: number; background: string; color: string };

// Round avatar with the first letter of the first two words ("Ana" → A, "Tienda Ruta N" → TR); decorative only.
export function Initials({ name, size, background, color }: Props) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <Text style={[styles.text, { color, fontSize: Math.round(size * 0.38) }]}>{letters}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '600' },
});
