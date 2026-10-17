import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { RoleTabs } from '@/components/role-tabs';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';
import { NfcTap } from '@/nfc/nfc-tap';

export default function VendorTabs() {
  const { vendorId } = useSession();
  const t = useCopy(commonCopy);

  // Reader mode stays on while the terminal app is open, not just while a sale waits. A phone in reader mode captures
  // every tag itself and stops emulating a card, so neither phone shows Android's "Select an app to use" dialog on a
  // touch; useSale acts only on taps while a sale is AWAITING_TAP. Android pauses and resumes it with the activity.
  useEffect(() => {
    if (!vendorId) return;
    NfcTap?.startReader();
    return () => NfcTap?.stopReader();
  }, [vendorId]);

  if (!vendorId) return <Redirect href="/vendor" />;
  return (
    <RoleTabs
      role="vendor"
      tabs={[
        { name: 'sale', title: t.tabs.sale, icon: 'contactless-payment' },
        { name: 'dashboard', title: t.tabs.dashboard, icon: 'chart-bar' },
        { name: 'transactions', title: t.tabs.transactions, icon: 'format-list-bulleted' },
        { name: 'recurring', title: t.tabs.recurring, icon: 'calendar-sync' },
        { name: 'wallet', title: t.tabs.wallet, icon: 'wallet-outline' },
        { name: 'settings', title: t.tabs.settings, icon: 'tune-variant' },
      ]}
    />
  );
}
