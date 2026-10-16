import { ConnectionLabel } from '@/components/connection-label';
import { Screen } from '@/components/screen';
import { WalletsPanel } from '@/components/wallets-panel';

export default function DebugTools() {
  return (
    <Screen>
      <ConnectionLabel />
      <WalletsPanel />
    </Screen>
  );
}
