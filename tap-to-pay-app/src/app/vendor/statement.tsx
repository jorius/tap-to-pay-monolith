import { Screen } from '@/components/screen';
import { StatementCard } from '@/components/vendor/statement-card';
import { VendorGate } from '@/components/vendor/vendor-gate';

// Más › Mi historial de negocio (design): the monthly statement a lender asks for, as a PDF.
export default function StatementScreen() {
  return (
    <VendorGate>
      {(vendor) => (
        <Screen>
          <StatementCard vendorId={vendor.id} />
        </Screen>
      )}
    </VendorGate>
  );
}
