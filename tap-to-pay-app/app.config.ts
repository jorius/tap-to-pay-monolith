import type { ConfigContext, ExpoConfig } from 'expo/config';

// One role per APK: EXPO_PUBLIC_APP_ROLE is read at prebuild and gradle time and lands in extra.role, which
// expo-constants embeds in the APK, so two phones on the same Metro keep their own roles (design, Builds frame).
// color is the launcher icon's background: the brand's light tints, so the logo's teal and amber stay legible and the
// two builds' icons still differ.
const ROLES = {
  vendor: { name: 'Paynela Comercio', suffix: '.vendor', color: '#FFF3E3' },
  buyer: { name: 'Paynela Billetera', suffix: '.buyer', color: '#E7F5F3' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const role = process.env.EXPO_PUBLIC_APP_ROLE;
  if (!role) return config as ExpoConfig; // no role: a development build that shows the role picker
  if (role !== 'vendor' && role !== 'buyer') {
    throw new Error(`EXPO_PUBLIC_APP_ROLE must be vendor or buyer, got "${role}"`);
  }
  const { name, suffix, color } = ROLES[role];
  return {
    ...config,
    name,
    android: {
      ...config.android,
      package: `${config.android?.package}${suffix}`,
      adaptiveIcon: { ...config.android?.adaptiveIcon, backgroundColor: color },
    },
    extra: { ...config.extra, role },
  } as ExpoConfig;
};
