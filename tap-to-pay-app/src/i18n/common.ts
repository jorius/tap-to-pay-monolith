import { defineCopy } from '@/i18n';

// Copy shared by the navigation: app names, tab labels, screen titles and the header API pill.
export const commonCopy = defineCopy(
  {
    appName: { vendor: 'Tap to Pay Comercio', buyer: 'Tap to Pay Billetera' },
    devApp: 'Tap to Pay · build sin rol',
    tabs: {
      sale: 'Cobrar',
      dashboard: 'Panel',
      transactions: 'Movimientos',
      wallet: 'Billetera',
      card: 'Tarjeta',
      wallets: 'Billeteras',
      history: 'Historial',
      settings: 'Ajustes',
    },
    titles: { vendor: '¿Qué comercio?', buyer: '¿Quién usa este teléfono?', debug: 'Depuración' },
    api: {
      checking: 'Revisando el servicio. Abrir herramientas de depuración',
      connected: 'Conectado al servicio. Abrir herramientas de depuración',
      unreachable: 'Sin conexión con el servicio. Abrir herramientas de depuración',
    },
  },
  {
    appName: { vendor: 'Tap to Pay Comercio', buyer: 'Tap to Pay Billetera' },
    devApp: 'Tap to Pay · build without a role',
    tabs: {
      sale: 'Charge',
      dashboard: 'Dashboard',
      transactions: 'Transactions',
      wallet: 'Wallet',
      card: 'Card',
      wallets: 'Wallets',
      history: 'History',
      settings: 'Settings',
    },
    titles: { vendor: 'Which vendor is this?', buyer: 'Who uses this phone?', debug: 'Debug' },
    api: {
      checking: 'Checking the service. Open debug tools',
      connected: 'Connected to the service. Open debug tools',
      unreachable: 'No connection to the service. Open debug tools',
    },
  },
);
