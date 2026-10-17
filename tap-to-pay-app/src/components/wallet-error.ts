import { apiUrl, ApiError } from '@/api/client';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    codes: {
      WALLET_NOT_FOUND: 'Esa billetera ya no está registrada en el servicio.',
      WALLET_TAKEN: 'Esa billetera ya está registrada.',
      LAST_WALLET: 'No puedes quitar tu única billetera.',
    } as Record<string, string>,
    unreachable: (message: string) => `No se pudo leer esa billetera: ${message}`,
    network: (url: string) => `No se pudo conectar con el servicio en ${url}.`,
  },
  {
    codes: {
      WALLET_NOT_FOUND: 'That wallet is no longer registered in the service.',
      WALLET_TAKEN: 'That wallet is already registered.',
      LAST_WALLET: "You can't remove your only wallet.",
    },
    unreachable: (message: string) => `Couldn't read that wallet: ${message}`,
    network: (url: string) => `Can't reach the service at ${url}.`,
  },
);

// Words a failed wallet write (add, set default, remove, limits); unknown codes keep the service's message.
export function useWalletError() {
  const t = useCopy(copy);
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return String(e);
    if (e.code === 'WALLET_UNREACHABLE') return t.unreachable(e.message);
    if (e.code === 'NETWORK') return t.network(apiUrl);
    return t.codes[e.code] ?? e.message;
  };
}
