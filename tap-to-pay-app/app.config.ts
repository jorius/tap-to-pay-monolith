import type { ConfigContext, ExpoConfig } from 'expo/config';

// One role per APK: EXPO_PUBLIC_APP_ROLE is read at prebuild and gradle time and lands in extra.role, which
// expo-constants embeds in the APK, so two phones on the same Metro keep their own roles (design, Builds frame).
const ROLES = {
  vendor: { name: 'Tap to Pay Comercio', suffix: '.vendor', color: '#E07A1F' },
  buyer: { name: 'Tap to Pay Billetera', suffix: '.buyer', color: '#0E9F8F' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  // process.env is untyped in the app's tsconfig (no Node types): type it here so the checks below narrow the role.
  const role: string | undefined = process.env.EXPO_PUBLIC_APP_ROLE;
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
