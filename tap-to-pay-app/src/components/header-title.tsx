import { StyleSheet, Text, View } from 'react-native';

import { appRole } from '@/config/role';
import { useTheme } from '@/hooks/use-theme';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

// Screen title with the build's app name under it (design header).
export function HeaderTitle({ title }: { title: string }) {
  const theme = useTheme();
  const t = useCopy(commonCopy);
  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.app, { color: theme.muted }]}>{appRole ? t.appName[appRole] : t.devApp}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, lineHeight: 24, fontWeight: '800' },
  app: { fontSize: 12, lineHeight: 16 },
});
