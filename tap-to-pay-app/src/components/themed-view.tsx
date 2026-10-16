import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & { card?: boolean };

export function ThemedView({ card = false, style, ...rest }: Props) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: card ? theme.card : theme.background }, card && styles.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12 },
});
