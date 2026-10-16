import { Redirect } from 'expo-router';

import { RoleTabs } from '@/components/role-tabs';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

export default function VendorTabs() {
  const { vendorId } = useSession();
  const t = useCopy(commonCopy);
  if (!vendorId) return <Redirect href="/vendor" />;
  return (
    <RoleTabs
      role="vendor"
      tabs={[
        { name: 'sale', title: t.tabs.sale, icon: 'contactless-payment' },
        { name: 'dashboard', title: t.tabs.dashboard, icon: 'chart-bar' },
        { name: 'transactions', title: t.tabs.transactions, icon: 'format-list-bulleted' },
        { name: 'wallet', title: t.tabs.wallet, icon: 'wallet-outline' },
        { name: 'settings', title: t.tabs.settings, icon: 'tune-variant' },
      ]}
    />
  );
}
