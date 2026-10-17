import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = TextProps & { type?: keyof typeof styles };

export function ThemedText({ type = 'default', style, ...rest }: Props) {
  const theme = useTheme();
  return <Text style={[{ color: type === 'caption' ? theme.muted : theme.text }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600' },
  subtitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20 },
});
