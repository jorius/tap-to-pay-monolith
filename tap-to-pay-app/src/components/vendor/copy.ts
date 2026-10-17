import { defineCopy } from '@/i18n';

// Words every vendor screen shares: sale statuses, refusals by failureCode, loading and error states.
export const vendorCopy = defineCopy(
  {
    status: { PAID: 'PAGADO', FAILED: 'FALLIDO', CHARGING: 'COBRANDO', AWAITING_TAP: 'ESPERANDO' },
    failure: {
      BUYER_UNKNOWN: 'Tarjeta no registrada',
      GRANT_MISSING: 'El comprador no ha autorizado esta terminal (npm run grant:buyer)',
      LIMIT_PER_PAYMENT: 'Supera el tope por pago (máx. {amount})',
      LIMIT_DAILY: 'Supera el tope diario (quedan {amount})',
      GRANT_LIMIT: 'Supera lo autorizado hoy en la billetera del comprador (quedan {amount})',
      WALLET_ERROR: 'La billetera rechazó el cobro: {message}',
    } as Record<string, string>,
    unregistered: 'No registrado',
    loading: 'Cargando',
    retry: 'Reintentar',
    network: 'No se pudo conectar con el servicio en {url}. ¿Está corriendo y EXPO_PUBLIC_API_URL apunta a la IP del portátil?',
    missing: 'Este comercio ya no está registrado en el servicio.',
    pickAgain: 'Elegir otro comercio',
  },
  {
    status: { PAID: 'PAID', FAILED: 'FAILED', CHARGING: 'CHARGING', AWAITING_TAP: 'WAITING' },
    failure: {
      BUYER_UNKNOWN: 'Card not registered',
      GRANT_MISSING: "Buyer hasn't authorized this terminal (npm run grant:buyer)",
      LIMIT_PER_PAYMENT: 'Over the per-payment limit (max {amount})',
      LIMIT_DAILY: "Over today's limit ({amount} left)",
      GRANT_LIMIT: "Over what the buyer's wallet authorized today ({amount} left)",
      WALLET_ERROR: 'The wallet refused the charge: {message}',
    },
    unregistered: 'Not registered',
    loading: 'Loading',
    retry: 'Try again',
    network: "Can't reach the service at {url}. Is it running, and does EXPO_PUBLIC_API_URL point at the laptop's IP?",
    missing: 'This vendor is no longer registered in the service.',
    pickAgain: 'Pick another vendor',
  },
);
