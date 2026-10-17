import type { ReactNode } from 'react';

import type { VendorView } from '@/api/types';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { vendorCopy } from '@/components/vendor/copy';
import { ErrorState, LoadingState } from '@/components/vendor/states';
import { Fills } from '@/constants/theme';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useCopy } from '@/i18n';

type Replace = (next: VendorView) => void;
type Reload = () => Promise<void>;

// Resolves the vendor this phone is (GET /vendors has no single-vendor route) before a tab renders. A vendor id kept on
// the phone that the service no longer knows sends the user back to the vendor list.
export function VendorGate({ children }: { children: (vendor: VendorView, replace: Replace, reload: Reload) => ReactNode }) {
  const { vendorId, update } = useSession();
  const t = useCopy(vendorCopy);
  const { data, error, reload, set } = useApi<VendorView[]>('/vendors');
  const vendor = data?.find((v) => v.id === vendorId);
  // A wallet write answers with the fresh vendor; it replaces the cached one instead of re-reading every vendor.
  const replace: Replace = (next) => set((data ?? []).map((v) => (v.id === next.id ? next : v)));
  if (vendor) return children(vendor, replace, reload);

  return (
    <Screen onRefresh={reload}>
      {data ? (
        <ThemedView card>
          <ThemedText>{t.missing}</ThemedText>
          <BigButton label={t.pickAgain} color={Fills.primary} onPress={() => update({ vendorId: null })} />
        </ThemedView>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <LoadingState />
      )}
    </Screen>
  );
}
