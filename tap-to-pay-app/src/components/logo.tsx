import { Image, StyleSheet, View } from 'react-native';

import { useScheme } from '@/hooks/use-theme';

// The Paynela logo, cube and wordmark. Its dark-teal "Pay" fades on the dark theme, so there it sits on a white plate.
export function Logo({ label, height = 104 }: { label: string; height?: number }) {
  const dark = useScheme() === 'dark';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.wrap, dark && styles.plate]}>
      <Image source={require('@/assets/images/paynela-logo.png')} resizeMode="contain" style={{ height, aspectRatio: 972 / 870 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  plate: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 },
});
