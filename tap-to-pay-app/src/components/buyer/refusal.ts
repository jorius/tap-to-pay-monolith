import type { SaleView } from '@/api/types';
import { failureText } from '@/components/vendor/format';
import { defineCopy, useCopy, useLang } from '@/i18n';

// Why a charge to this buyer failed, in the buyer's words; the amount in the service's message is reused.
const copy = defineCopy(
  {
    GRANT_MISSING: 'Esta billetera todavía no le dio permiso a la app para pagar.',
    LIMIT_PER_PAYMENT: 'Pasa tu límite de {amount} por compra.',
    LIMIT_DAILY: 'Pasa tu límite de hoy: te quedaban {amount}.',
    GRANT_LIMIT: 'Pasa lo que autorizaste hoy en tu billetera: quedaban {amount}.',
    WALLET_ERROR: 'Tu billetera rechazó el pago: {message}',
  } as Record<string, string>,
  {
    GRANT_MISSING: 'This wallet has not given the app permission to pay yet.',
    LIMIT_PER_PAYMENT: 'Over your {amount} per-purchase limit.',
    LIMIT_DAILY: "Over today's limit: you had {amount} left.",
    GRANT_LIMIT: 'Over what you authorized today in your wallet: {amount} left.',
    WALLET_ERROR: 'Your wallet refused the payment: {message}',
  },
);

export function useRefusalText() {
  const templates = useCopy(copy);
  const lang = useLang();
  return (sale: SaleView) => failureText(sale, templates, lang);
}

// A refusal by the buyer's own caps, which Mis límites can raise; the wallet's consent cap needs the grant screen.
export const isLimitRefusal = (sale: SaleView) =>
  sale.failureCode === 'LIMIT_PER_PAYMENT' || sale.failureCode === 'LIMIT_DAILY';
