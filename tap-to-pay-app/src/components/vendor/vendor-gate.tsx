import type { ReactNode } from 'react';

import type { VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { Fill } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';

// Resolves the vendor this phone is (GET /vendors has no single-vendor route) before a tab renders. A vendor id kept on
// the phone that the service no longer knows sends the user back to the vendor list.
export function VendorGate({ children }: { children: (vendor: VendorView) => ReactNode }) {
  const { vendorId, update } = useSession();
  const t = useCopy(vendorCopy);
  const { data, error, reload } = useApi<VendorView[]>('/vendors');
  const vendor = data?.find((v) => v.id === vendorId);
  if (vendor) return children(vendor);

  return (
    <Screen>
      {data ? (
        <ThemedView card>
          <ThemedText>{t.missing}</ThemedText>
          <BigButton label={t.pickAgain} color={Fill.vendor} onPress={() => update({ vendorId: null })} />
        </ThemedView>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <LoadingState />
      )}
    </Screen>
  );
}
