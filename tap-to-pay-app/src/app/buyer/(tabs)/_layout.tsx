import { Redirect } from 'expo-router';

import { PaymentFeedback } from '@/components/buyer/payment-feedback';
import { RoleTabs } from '@/components/role-tabs';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';
import { commonCopy } from '@/i18n/common';

export default function BuyerTabs() {
  const { buyerId } = useSession();
  const t = useCopy(commonCopy);
  if (!buyerId) return <Redirect href="/" />;
  return (
    <>
      <RoleTabs
        role="buyer"
        tabs={[
          { name: 'card', title: t.tabs.pay, icon: 'credit-card-outline' },
          { name: 'history', title: t.tabs.movements, icon: 'format-list-bulleted' },
          { name: 'account', title: t.tabs.account, icon: 'account-outline' },
        ]}
      />
      {/* Over every tab, so a tap's outcome shows wherever the buyer is. */}
      <PaymentFeedback key={buyerId} buyerId={buyerId} />
    </>
  );
}
