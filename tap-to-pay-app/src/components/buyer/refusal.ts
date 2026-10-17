import type { SaleView } from '@/api/types';
import { failureText } from '@/components/vendor/format';
import { defineCopy, useCopy, useLang } from '@/i18n';

// Why a charge to this buyer failed, in the buyer's words; the amount in the service's message is reused.
const copy = defineCopy(
  {
    GRANT_MISSING: 'Esta billetera aún no autoriza pagos (npm run grant:buyer).',
    LIMIT_PER_PAYMENT: 'Supera tu tope por pago (máx. {amount}).',
    LIMIT_DAILY: 'Supera tu tope diario (quedan {amount}).',
    GRANT_LIMIT: 'Supera lo que autorizaste hoy en tu billetera (quedan {amount}).',
    WALLET_ERROR: 'Tu billetera rechazó el pago: {message}',
  } as Record<string, string>,
  {
    GRANT_MISSING: 'This wallet does not authorize payments yet (npm run grant:buyer).',
    LIMIT_PER_PAYMENT: 'Over your per-payment limit (max {amount}).',
    LIMIT_DAILY: 'Over your daily limit ({amount} left).',
    GRANT_LIMIT: 'Over what you authorized today in your wallet ({amount} left).',
    WALLET_ERROR: 'Your wallet refused the payment: {message}',
  },
);

export function useRefusalText() {
  const templates = useCopy(copy);
  const lang = useLang();
  return (sale: SaleView) => failureText(sale, templates, lang);
}
