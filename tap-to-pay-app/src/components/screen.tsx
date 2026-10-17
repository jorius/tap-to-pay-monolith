import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

type Props = { children: ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean };

// The stack header already covers the top inset, so only the bottom and sides are padded here. With onRefresh, a pull
// down re-reads the screen's data and the spinner stays until that promise settles. scroll={false} lays the children
// out in the visible height instead (the vendor's calculator), with no pull-to-refresh.
export function Screen({ children, onRefresh, scroll = true }: Props) {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    onRefresh?.().finally(() => setRefreshing(false));
  };
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: theme.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh && (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                colors={[theme.text]}
                progressBackgroundColor={theme.surface}
                tintColor={theme.text}
              />
            )
          }>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, styles.content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 16 },
});
