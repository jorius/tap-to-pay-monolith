import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionDot } from '@/components/connection-label';
import { HeaderTitle } from '@/components/header-title';
import type { AppRole } from '@/config/role';
import { roleColors } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type RoleTab = { name: string; title: string; icon: IconName };

// The bottom navigation of each build: the active tab in the brand's teal over a tinted pill, on a white bar.
export function RoleTabs({ role, tabs }: { role: AppRole; tabs: RoleTab[] }) {
  const theme = useTheme();
  const { debugLabels } = useSession();
  const colors = roleColors(theme, role);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerRight: debugLabels ? () => <ConnectionDot /> : undefined,
        headerRightContainerStyle: styles.headerRight,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: styles.label,
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerTitle: () => <HeaderTitle title={tab.title} />,
            tabBarIcon: ({ focused, color }) => (
              <View style={[styles.icon, focused && { backgroundColor: colors.tint }]}>
                <MaterialCommunityIcons name={tab.icon} size={22} color={color} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRight: { paddingRight: 12 },
  label: { fontSize: 11.5, fontWeight: '600' },
  icon: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
