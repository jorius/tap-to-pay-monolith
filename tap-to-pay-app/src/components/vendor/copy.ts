import { defineCopy } from '@/i18n';

// Words every vendor screen shares: sale statuses, refusals by failureCode, loading and error states.
export const vendorCopy = defineCopy(
  {
    status: { PAID: 'Pagado', FAILED: 'Rechazado', CHARGING: 'En curso', AWAITING_TAP: 'Esperando' },
    failure: {
      BUYER_UNKNOWN: 'Tarjeta no registrada',
      GRANT_MISSING: 'El comprador no ha autorizado esta terminal (npm run grant:buyer)',
      LIMIT_PER_PAYMENT: 'Supera el tope por pago (máx. {amount})',
      LIMIT_DAILY: 'Supera el tope diario (quedan {amount})',
      GRANT_LIMIT: 'Supera lo autorizado hoy en la billetera del comprador (quedan {amount})',
      WALLET_ERROR: 'La billetera rechazó el cobro: {message}',
    } as Record<string, string>,
    unregistered: 'No registrado',
    // Mis ventas and the sale detail (Paynela design): "Recibido" for money in, "No pasó · why" for a refusal.
    outcome: { PAID: 'Recibido', FAILED: 'Rechazado', CHARGING: 'En curso', AWAITING_TAP: 'Esperando' },
    noPass: 'No pasó',
    failureShort: {
      BUYER_UNKNOWN: 'tarjeta no registrada',
      GRANT_MISSING: 'sin autorizar',
      LIMIT_PER_PAYMENT: 'límite',
      LIMIT_DAILY: 'límite',
      GRANT_LIMIT: 'límite',
      WALLET_ERROR: 'billetera',
    } as Record<string, string>,
    walletNamed: 'Billetera {code}',
    paymentTo: (payee: string) => `Pago a ${payee}`,
    loading: 'Cargando',
    retry: 'Reintentar',
    network: 'No se pudo conectar con el servicio en {url}. ¿Está corriendo y EXPO_PUBLIC_API_URL apunta a la IP del portátil?',
    missing: 'Este comercio ya no está registrado en el servicio.',
    pickAgain: 'Elegir otro comercio',
  },
  {
    status: { PAID: 'Paid', FAILED: 'Refused', CHARGING: 'In progress', AWAITING_TAP: 'Waiting' },
    failure: {
      BUYER_UNKNOWN: 'Card not registered',
      GRANT_MISSING: "Buyer hasn't authorized this terminal (npm run grant:buyer)",
      LIMIT_PER_PAYMENT: 'Over the per-payment limit (max {amount})',
      LIMIT_DAILY: "Over today's limit ({amount} left)",
      GRANT_LIMIT: "Over what the buyer's wallet authorized today ({amount} left)",
      WALLET_ERROR: 'The wallet refused the charge: {message}',
    },
    unregistered: 'Not registered',
    outcome: { PAID: 'Received', FAILED: 'Refused', CHARGING: 'In progress', AWAITING_TAP: 'Waiting' },
    noPass: "Didn't go through",
    failureShort: {
      BUYER_UNKNOWN: 'card not registered',
      GRANT_MISSING: 'not authorized',
      LIMIT_PER_PAYMENT: 'limit',
      LIMIT_DAILY: 'limit',
      GRANT_LIMIT: 'limit',
      WALLET_ERROR: 'wallet',
    },
    walletNamed: '{code} wallet',
    paymentTo: (payee: string) => `Payment to ${payee}`,
    loading: 'Loading',
    retry: 'Try again',
    network: "Can't reach the service at {url}. Is it running, and does EXPO_PUBLIC_API_URL point at the laptop's IP?",
    missing: 'This vendor is no longer registered in the service.',
    pickAgain: 'Pick another vendor',
  },
);
