import { Redirect } from 'expo-router';

import { RoleTabs } from '@/components/role-tabs';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

export default function BuyerTabs() {
  const { buyerId } = useSession();
  const t = useCopy(commonCopy);
  if (!buyerId) return <Redirect href="/buyer" />;
  return (
    <RoleTabs
      role="buyer"
      tabs={[
        { name: 'card', title: t.tabs.card, icon: 'credit-card-outline' },
        { name: 'wallets', title: t.tabs.wallets, icon: 'wallet-outline' },
        { name: 'history', title: t.tabs.history, icon: 'clock-outline' },
        { name: 'settings', title: t.tabs.settings, icon: 'tune-variant' },
      ]}
    />
  );
}
