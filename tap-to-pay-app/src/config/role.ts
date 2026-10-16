import Constants from 'expo-constants';

export type AppRole = 'vendor' | 'buyer';

// Baked into each APK by app.config.ts. Never read process.env.EXPO_PUBLIC_APP_ROLE here: Metro inlines one value
// for every phone it serves, while extra.role comes from the APK itself.
const role = Constants.expoConfig?.extra?.role;

export const appRole: AppRole | null = role === 'vendor' || role === 'buyer' ? role : null;
