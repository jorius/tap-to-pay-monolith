import { defineCopy } from '@/i18n';

// Copy shared by the navigation: app names, tab labels, screen titles and the header API pill.
export const commonCopy = defineCopy(
  {
    appName: { vendor: 'Paynela Comercio', buyer: 'Paynela Billetera' },
    devApp: 'Paynela · build sin rol',
    tabs: {
      sale: 'Cobrar',
      sales: 'Mis ventas',
      more: 'Más',
      pay: 'Pagar',
      movements: 'Movimientos',
      account: 'Cuenta',
    },
    titles: {
      vendor: '¿Qué comercio?',
      buyer: '¿Quién usa este teléfono?',
      debug: 'Depuración',
      grant: 'Autorizar billetera',
      wallets: 'Dónde recibo la plata',
      limits: 'Mis límites',
      activate: 'Activar pagos',
      settings: 'Ajustes',
      scan: 'Pagar con QR o link',
      pay: 'Pagar',
      recurring: 'Pagos de servicios',
      statement: 'Mi historial de negocio',
    },
    api: {
      checking: 'Revisando el servicio. Abrir herramientas de depuración',
      connected: 'Conectado al servicio. Abrir herramientas de depuración',
      unreachable: 'Sin conexión con el servicio. Abrir herramientas de depuración',
    },
  },
  {
    appName: { vendor: 'Paynela Comercio', buyer: 'Paynela Billetera' },
    devApp: 'Paynela · build without a role',
    tabs: {
      sale: 'Charge',
      sales: 'My sales',
      more: 'More',
      pay: 'Pay',
      movements: 'Activity',
      account: 'Account',
    },
    titles: {
      vendor: 'Which vendor is this?',
      buyer: 'Who uses this phone?',
      debug: 'Debug',
      grant: 'Authorize wallet',
      wallets: 'Where I get paid',
      limits: 'My limits',
      activate: 'Turn on payments',
      settings: 'Settings',
      scan: 'Pay with a QR or link',
      pay: 'Pay',
      recurring: 'Bill payments',
      statement: 'My business history',
    },
    api: {
      checking: 'Checking the service. Open debug tools',
      connected: 'Connected to the service. Open debug tools',
      unreachable: 'No connection to the service. Open debug tools',
    },
  },
);
