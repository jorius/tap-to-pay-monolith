import { StyleSheet, Text, View } from 'react-native';

import type { BillerView } from '@/api/types';
import { Brand } from '@/constants/theme';

// A service's mark: its brand colour with its initials. The logos are the brands' trademarks and do not ship; a team
// allowed to use one can render it here instead, from tap-to-pay-app/assets.
export function BillerBadge({ biller, name, size = 48 }: { biller?: BillerView; name: string; size?: number }) {
  const initials = biller?.initials ?? initialsOf(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: biller?.color ?? Brand.service }]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.text, { color: biller?.textColor ?? '#FFFFFF', fontSize: size * (initials.length > 2 ? 0.3 : 0.42) }]}>
        {initials}
      </Text>
    </View>
  );
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  text: { fontWeight: '900', letterSpacing: 0.5 },
});
