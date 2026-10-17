import { useState } from 'react';

import { ConnectionLabel } from '@/components/connection-label';
import { Screen } from '@/components/screen';
import { WalletsPanel } from '@/components/wallets-panel';

export default function DebugTools() {
  // A pull remounts the panel, which re-reads /debug/wallets behind its own spinner.
  const [refreshes, setRefreshes] = useState(0);
  return (
    <Screen onRefresh={async () => setRefreshes((n) => n + 1)}>
      <ConnectionLabel />
      <WalletsPanel key={refreshes} />
    </Screen>
  );
}
