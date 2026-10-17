import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import type { PaymentLinkView, PaymentRequestView, SaleView } from '../contracts.js';
import type { SaleRow } from '../db/repos.js';
import { HttpError, validation } from './errors.js';
import { formatAmount } from './money.js';
import { chargeSale, loadSale, type Deps } from './sales.js';

// A payment link is another way to charge a sale that is AWAITING_TAP: the vendor shares it by WhatsApp or shows it as
// a QR, and the buyer's app charges it with the same rules as a tap. The link carries a random code, never the sale id.

export type LinkLang = 'es' | 'en';

/** POST /sales/:id/payment-link: the sale's live link, created on first use and again once the previous one expired. */
export async function createPaymentLink(
  deps: Deps,
  saleId: string,
  baseUrl: string,
  options: { phone?: string; lang?: LinkLang } = {},
): Promise<PaymentLinkView> {
  const phone = options.phone === undefined ? undefined : normalizePhone(options.phone);
  let sale = await loadSale(deps.repo, saleId);
  if (sale.status !== 'AWAITING_TAP') {
    throw new HttpError(409, 'SALE_NOT_CHARGEABLE', `Sale is ${sale.status}`);
  }
  if (!sale.payCode || isExpired(deps, sale)) {
    sale = await deps.repo.updateSale(saleId, {
      payCode: newCode(),
      payCodeExpiresAt: new Date(deps.now().getTime() + deps.links.ttlMinutes * 60_000),
    });
  }
  const vendorName = await vendorNameOf(deps, sale);
  return linkView(deps, sale, vendorName, baseUrl, options.lang ?? 'es', phone);
}

/** GET /pay/:code: what the buyer's app shows before paying. */
export async function getPaymentRequest(deps: Deps, code: string): Promise<PaymentRequestView> {
  const sale = await loadByCode(deps, code);
  return requestView(deps, sale, await vendorNameOf(deps, sale));
}

/** POST /pay/:code/charge: the buyer pays with one of their registered wallets; the result is the sale, as for a tap. */
export async function chargePaymentLink(deps: Deps, code: string, walletAddress: string): Promise<SaleView> {
  const sale = await loadByCode(deps, code);
  if (sale.status === 'AWAITING_TAP' && isExpired(deps, sale)) {
    throw new HttpError(410, 'PAYMENT_LINK_EXPIRED', 'Payment link expired');
  }
  // shortcut: whoever holds the link can charge it to any registered wallet address, as a forged card could.
  return chargeSale(deps, sale.id, walletAddress, 'LINK');
}

/** GET /pay/:code/qr.svg: the link as a QR code. */
export async function paymentLinkQrSvg(deps: Deps, code: string, baseUrl: string): Promise<string> {
  await loadByCode(deps, code);
  return QRCode.toString(publicUrl(baseUrl, code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}

/** GET /p/:code: a small page for WhatsApp previews and browsers, with a button that opens the app. */
export async function paymentLinkPage(deps: Deps, code: string, lang: LinkLang): Promise<{ status: number; html: string }> {
  const sale = await deps.repo.getSaleByPayCode(code);
  if (!sale) return { status: 404, html: renderPage({ lang, title: text[lang].notFound }) };
  const view = requestView(deps, sale, await vendorNameOf(deps, sale));
  return { status: 200, html: renderPage({ lang, view, appUrl: appUrl(deps, code) }) };
}

export function publicUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/p/${code}`;
}

function appUrl(deps: Deps, code: string): string {
  return `${deps.links.appScheme}://pay/${code}`;
}

async function loadByCode(deps: Deps, code: string): Promise<SaleRow> {
  const sale = await deps.repo.getSaleByPayCode(code);
  if (!sale) throw new HttpError(404, 'PAYMENT_LINK_NOT_FOUND', 'Payment link not found');
  return sale;
}

function isExpired(deps: Deps, sale: SaleRow): boolean {
  return sale.payCodeExpiresAt !== null && deps.now() >= sale.payCodeExpiresAt;
}

/** 72 random bits in 12 URL-safe characters. */
function newCode(): string {
  return randomBytes(9).toString('base64url');
}

/** Digits only, with the country code (573001234567); 8 to 15 digits as in E.164. */
function normalizePhone(input: string): string {
  const digits = input.replace(/[\s()+.-]/g, '');
  if (!/^\d{8,15}$/.test(digits)) {
    throw validation('phone must be 8 to 15 digits with the country code, e.g. 573001234567');
  }
  return digits;
}

async function vendorNameOf(deps: Deps, sale: SaleRow): Promise<string> {
  const vendor = await deps.repo.getVendor(sale.vendorId);
  if (!vendor) return '';
  const wallet = vendor.wallets.find((w) => w.id === sale.vendorWalletId);
  return wallet?.publicName ?? vendor.name;
}

function requestView(deps: Deps, sale: SaleRow, vendorName: string): PaymentRequestView {
  return {
    code: sale.payCode!,
    saleId: sale.id,
    vendorName,
    amount: sale.amount.toString(),
    amountFormatted: formatAmount(sale.amount, sale.assetScale),
    assetCode: sale.assetCode,
    assetScale: sale.assetScale,
    description: sale.description,
    status: sale.status,
    expiresAt: sale.payCodeExpiresAt!.toISOString(),
    expired: sale.status === 'AWAITING_TAP' && isExpired(deps, sale),
    failureCode: sale.failureCode,
    failureMessage: sale.failureMessage,
    paidAt: sale.paidAt ? sale.paidAt.toISOString() : null,
  };
}

function linkView(
  deps: Deps,
  sale: SaleRow,
  vendorName: string,
  baseUrl: string,
  lang: LinkLang,
  phone: string | undefined,
): PaymentLinkView {
  const code = sale.payCode!;
  const url = publicUrl(baseUrl, code);
  const message = whatsappMessage(deps, sale, vendorName, url, lang);
  return {
    code,
    saleId: sale.id,
    url,
    appUrl: appUrl(deps, code),
    qrPayload: url,
    qrSvgUrl: `${baseUrl.replace(/\/+$/, '')}/pay/${code}/qr.svg`,
    whatsappUrl: `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(message)}`,
    message,
    expiresAt: sale.payCodeExpiresAt!.toISOString(),
  };
}

/**
 * The WhatsApp message: who charges, how much, for what, a reference, the link, when it expires, how to pay and a
 * safety note. *text* is bold in WhatsApp; the link sits on its own line so WhatsApp makes it tappable.
 */
function whatsappMessage(deps: Deps, sale: SaleRow, vendorName: string, url: string, lang: LinkLang): string {
  const t = text[lang];
  const when = (date: Date) =>
    new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', {
      timeZone: deps.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  return [
    t.hello,
    t.requested(vendorName),
    '',
    `💰 *${t.amount}:* ${localMoney(sale.amount, sale.assetScale, sale.assetCode, lang)}`,
    ...(sale.description ? [`📝 *${t.concept}:* ${sale.description}`] : []),
    `🧾 *${t.reference}:* ${sale.payCode}`,
    `📅 *${t.date}:* ${when(sale.createdAt)}`,
    '',
    `👉 *${t.payHere}:*`,
    url,
    '',
    `⏰ *${t.expires}:* ${when(sale.payCodeExpiresAt!)}`,
    t.afterExpiry,
    '',
    `*${t.howTitle}*`,
    ...t.how.map((step, i) => `${i + 1}. ${step}`),
    '',
    `🔒 ${t.safety(vendorName)}`,
  ].join('\n');
}

/** As the app shows money: es-CO groups with "." and decimals with ",", en-US the other way; the asset code last. */
function localMoney(amount: bigint, scale: number, assetCode: string, lang: LinkLang): string {
  const [whole, fraction] = formatAmount(amount, scale).split('.');
  const [group, decimal] = lang === 'es' ? ['.', ','] : [',', '.'];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${fraction === undefined ? grouped : grouped + decimal + fraction} ${assetCode}`;
}

const text = {
  es: {
    hello: 'Hola 👋',
    requested: (vendor: string) => `*${vendor}* te envió una solicitud de pago por Tap to Pay.`,
    amount: 'Monto',
    concept: 'Concepto',
    reference: 'Referencia',
    date: 'Fecha',
    payHere: 'Paga aquí',
    expires: 'Vence',
    afterExpiry: 'Si vence, pídele al comercio un link nuevo.',
    howTitle: '¿Cómo pagar?',
    how: [
      'Abre el link de arriba.',
      'Toca *Pagar en la app*. También puedes abrir Tap to Pay → Tarjeta → *Pagar con QR o link* y pegarlo.',
      'Revisa el monto, elige tu billetera y toca *Pagar*.',
    ],
    safety: (vendor: string) =>
      `Antes de pagar, confirma que el comercio sea *${vendor}*. Tap to Pay nunca te pide contraseñas ni códigos por WhatsApp.`,
    title: (vendor: string, amount: string) => `Cobro de ${vendor}: ${amount}`,
    open: 'Pagar en la app',
    paid: 'Este cobro ya fue pagado.',
    expired: 'Este link venció. Pide al vendedor uno nuevo.',
    unavailable: 'Este cobro ya no se puede pagar.',
    noApp: '¿No se abrió la app? Copia este código y pégalo en Tap to Pay → Tarjeta → Pagar con QR o link.',
    copy: 'Copiar código',
    copied: 'Copiado ✓',
    selected: 'Código seleccionado: cópialo',
    notFound: 'Link de pago no encontrado',
  },
  en: {
    hello: 'Hi 👋',
    requested: (vendor: string) => `*${vendor}* sent you a payment request through Tap to Pay.`,
    amount: 'Amount',
    concept: 'For',
    reference: 'Reference',
    date: 'Date',
    payHere: 'Pay here',
    expires: 'Expires',
    afterExpiry: 'If it expires, ask the vendor for a new link.',
    howTitle: 'How to pay',
    how: [
      'Open the link above.',
      'Tap *Pay in the app*. You can also open Tap to Pay → Card → *Pay with a QR or link* and paste it.',
      'Check the amount, pick your wallet and tap *Pay*.',
    ],
    safety: (vendor: string) =>
      `Before paying, make sure the vendor is *${vendor}*. Tap to Pay never asks for passwords or codes on WhatsApp.`,
    title: (vendor: string, amount: string) => `Payment to ${vendor}: ${amount}`,
    open: 'Pay in the app',
    paid: 'This payment has already been made.',
    expired: 'This link has expired. Ask the vendor for a new one.',
    unavailable: 'This payment can no longer be made.',
    noApp: "The app didn't open? Copy this code and paste it in Tap to Pay → Card → Pay with a QR or link.",
    copy: 'Copy code',
    copied: 'Copied ✓',
    selected: 'Code selected: copy it',
    notFound: 'Payment link not found',
  },
} as const;

function renderPage(args: { lang: LinkLang; title?: string; view?: PaymentRequestView; appUrl?: string }): string {
  const t = text[args.lang];
  const { view } = args;
  const amount = view ? `${view.amountFormatted} ${view.assetCode}` : '';
  const title = view ? t.title(view.vendorName, amount) : (args.title ?? '');
  let body: string;
  if (!view) {
    body = `<h1>${esc(title)}</h1>`;
  } else {
    const state =
      view.status === 'PAID'
        ? `<p class="note">${esc(t.paid)}</p>`
        : view.expired
          ? `<p class="note">${esc(t.expired)}</p>`
          : view.status !== 'AWAITING_TAP'
            ? `<p class="note">${esc(t.unavailable)}</p>`
            : `<a class="pay" href="${esc(args.appUrl!)}">${esc(t.open)}</a><p class="hint">${esc(t.noApp)}</p>${copyCode(view.code, t)}`;
    body = `<p class="vendor">${esc(view.vendorName)}</p>
<p class="amount">${esc(amount)}</p>
${view.description ? `<p class="concept">${esc(view.description)}</p>` : ''}
${state}`;
  }
  const description = view?.description ?? '';
  return `<!doctype html>
<html lang="${args.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f6f6f8;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.vendor{margin:0;color:#555}.amount{margin:8px 0;font-size:2.2rem;font-weight:700}.concept{margin:0 0 16px;color:#333}
.pay{display:block;margin-top:16px;padding:14px;border-radius:12px;background:#6B2FB3;color:#fff;text-decoration:none;font-weight:600}
.hint,.note{font-size:.9rem;color:#666}
.code{box-sizing:border-box;width:100%;text-align:center;font-family:ui-monospace,monospace;font-size:1.3rem;letter-spacing:.05em;background:#f1f1f4;border:0;border-radius:8px;padding:10px;color:#111}
.copy{margin-top:8px;width:100%;padding:12px;border-radius:12px;border:2px solid #6B2FB3;background:#fff;color:#6B2FB3;font-size:1rem;font-weight:600}
</style>
</head>
<body><main>
${body}
</main></body>
</html>`;
}

/**
 * The code in a read-only field plus a Copy button. The Clipboard API only exists on https or localhost, and links on the
 * LAN are plain http, so the button falls back to selecting the field and execCommand('copy'), which Safari allows on a
 * tap; if even that fails, the code stays selected for the buyer to copy.
 */
function copyCode(code: string, t: (typeof text)[LinkLang]): string {
  const words = JSON.stringify({ copied: t.copied, selected: t.selected }).replace(/</g, '\\u003c');
  return `<input class="code" id="code" value="${esc(code)}" readonly aria-label="${esc(t.copy)}">
<button class="copy" id="copy" type="button">${esc(t.copy)}</button>
<script>
(function () {
  var words = ${words};
  var input = document.getElementById('code');
  var button = document.getElementById('copy');
  function select() { input.focus(); input.setSelectionRange(0, input.value.length); }
  button.addEventListener('click', function () {
    var done = function (ok) { button.textContent = ok ? words.copied : words.selected; if (!ok) select(); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(input.value).then(function () { done(true); }, function () { fallback(); });
    } else {
      fallback();
    }
    function fallback() {
      select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      done(ok);
    }
  });
})();
</script>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
