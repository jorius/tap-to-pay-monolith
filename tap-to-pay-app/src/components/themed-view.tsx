import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & { card?: boolean };

// A card is a white surface with a soft border, so it still reads on the near-white background (Paynela design system).
export function ThemedView({ card = false, style, ...rest }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[card ? [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }] : { backgroundColor: theme.background }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
});
