import { SettingsScreen } from '@/components/settings-screen';
import { appRole } from '@/config/role';

// Ajustes, reached from Más (vendor) and Cuenta (buyer).
export default function Settings() {
  return <SettingsScreen role={appRole ?? 'vendor'} />;
}
