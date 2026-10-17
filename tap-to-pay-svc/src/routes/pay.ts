import { Router } from 'express';
import QRCode from 'qrcode';
import type { SaleView } from '../contracts.js';
import { HttpError } from '../services/errors.js';
import { payLink, payPageData, payUrl, publicBaseUrl } from '../services/pay.js';
import type { Deps } from '../services/sales.js';

// The other two ways to send the buyer's wallet address to a sale, besides the NFC tap: a QR the buyer scans with the
// camera, and a link the vendor sends by WhatsApp. Both open GET /pay/:id, a page that calls POST /sales/:id/charge.
export function payRouter(deps: Deps, publicUrl?: string): Router {
  const router = Router();

  router.get('/sales/:id/pay-link', async (req, res) => {
    res.json({ data: await payLink(deps, req.params.id, publicBaseUrl(req, publicUrl)), error: null });
  });

  router.get('/sales/:id/qr.png', async (req, res) => {
    const sale = await deps.repo.getSale(req.params.id);
    if (!sale) throw new HttpError(404, 'SALE_NOT_FOUND', `Sale ${req.params.id} not found`);
    const png = await QRCode.toBuffer(payUrl(publicBaseUrl(req, publicUrl), sale.id), {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    res.set('cache-control', 'no-store').type('png').send(png);
  });

  router.get('/pay/:id', async (req, res) => {
    let data: { sale: SaleView; vendorName: string };
    try {
      data = await payPageData(deps, req.params.id);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        res.status(404).type('html').send(notFoundPage());
        return;
      }
      throw e;
    }
    res.set('cache-control', 'no-store').type('html').send(payPage(data.sale, data.vendorName));
  });

  return router;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// JSON inside <script>: "<" escaped so a value can never close the tag.
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const STYLE = `
  :root { --ink:#1f2328; --muted:#5b6470; --bg:#f6f7f9; --card:#fff; --brand:#E07A1F; --ok:#17845A; --bad:#BE3535; }
  @media (prefers-color-scheme: dark) { :root { --ink:#eef1f4; --muted:#a3acb7; --bg:#111418; --card:#1b2026; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--ink); }
  main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
  .card { background:var(--card); border-radius:18px; padding:20px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .caption { color:var(--muted); font-size:14px; margin:0 0 4px; }
  .amount { font-size:44px; font-weight:800; margin:4px 0 0; font-variant-numeric: tabular-nums; }
  .code { font-size:18px; font-weight:700; color:var(--muted); }
  label { display:block; font-weight:700; margin-bottom:8px; }
  input { width:100%; font-size:16px; padding:14px; border-radius:12px; border:2px solid #d0d5db; background:transparent; color:var(--ink); }
  button { width:100%; margin-top:14px; font-size:18px; font-weight:800; padding:16px; border:0; border-radius:14px; background:var(--brand); color:#fff; }
  button:disabled { opacity:.5; }
  .note { color:var(--muted); font-size:14px; line-height:1.4; }
  .status { font-size:22px; font-weight:800; text-align:center; margin:8px 0; }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
  .hidden { display:none; }
`;

function payPage(sale: SaleView, vendorName: string): string {
  const initial = { id: sale.id, status: sale.status, failureMessage: sale.failureMessage };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pagar a ${escapeHtml(vendorName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <div class="card">
    <p class="caption">Cobro de ${escapeHtml(vendorName)}</p>
    <p class="amount">${escapeHtml(sale.amountFormatted)} <span class="code">${escapeHtml(sale.assetCode)}</span></p>
  </div>

  <form id="form" class="card">
    <label for="wallet">Tu billetera (dirección de pago)</label>
    <input id="wallet" name="wallet" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false"
      placeholder="$ilp.interledger-test.dev/tu-nombre" required>
    <button id="pay" type="submit">Pagar</button>
    <p class="note">Se cobra con el permiso que ya le diste a tu billetera, dentro de tus topes, igual que al acercar el teléfono.
      La recordamos en este teléfono para la próxima vez.</p>
  </form>

  <div id="result" class="card hidden" aria-live="polite">
    <p id="status" class="status"></p>
    <p id="detail" class="note"></p>
  </div>
</main>
<script>
(function () {
  var sale = ${scriptJson(initial)};
  var form = document.getElementById('form');
  var input = document.getElementById('wallet');
  var button = document.getElementById('pay');
  var KEY = 'tap-to-pay:wallet';

  try { input.value = localStorage.getItem(KEY) || ''; } catch (e) {}

  function show(status, detail, tone) {
    document.getElementById('result').classList.remove('hidden');
    var el = document.getElementById('status');
    el.textContent = status;
    el.className = 'status ' + (tone || '');
    document.getElementById('detail').textContent = detail || '';
  }

  function settle(s) {
    if (s.status === 'PAID') { form.classList.add('hidden'); show('\\u2713 Pagado', 'Ya puedes mostrarle esta pantalla al vendedor.', 'ok'); return true; }
    if (s.status === 'FAILED') { show('\\u2715 No pagado', s.failureMessage || '', 'bad'); button.disabled = false; return true; }
    return false;
  }

  // "$wallet.example/alice" (payment pointer) to "https://wallet.example/alice".
  function toUrl(value) {
    var v = value.trim();
    if (v.charAt(0) === '$') return 'https://' + v.slice(1);
    if (!/^https?:\\/\\//i.test(v)) return 'https://' + v;
    return v;
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); });
  }

  function poll(tries) {
    if (tries <= 0) { show('? Sin confirmar', 'No pudimos confirmar el pago. Revisa tu billetera.', ''); return; }
    setTimeout(function () {
      api('GET', '/sales/' + encodeURIComponent(sale.id)).then(function (env) {
        if (env.data && settle(env.data)) return;
        poll(tries - 1);
      }).catch(function () { poll(tries - 1); });
    }, 1500);
  }

  if (sale.status !== 'AWAITING_TAP') {
    form.classList.add('hidden');
    if (!settle(sale)) { show('Cobrando\\u2026', '', ''); poll(20); }
    if (sale.status === 'FAILED') show('Este cobro ya no está disponible', 'Pídele al vendedor uno nuevo.', 'bad');
    return;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var walletAddress = toUrl(input.value);
    try { localStorage.setItem(KEY, input.value.trim()); } catch (e) {}
    button.disabled = true;
    show('Cobrando\\u2026', '', '');
    api('POST', '/sales/' + encodeURIComponent(sale.id) + '/charge', { walletAddress: walletAddress })
      .then(function (env) {
        if (env.error) {
          var msg = env.error.code === 'SALE_NOT_CHARGEABLE' ? 'Este cobro ya fue pagado o ya no está disponible.' : env.error.message;
          show('\\u2715 No pagado', msg, 'bad');
          button.disabled = env.error.code === 'SALE_NOT_CHARGEABLE';
          return;
        }
        if (!settle(env.data)) poll(20);
      })
      .catch(function () { show('? Sin confirmar', 'Se perdió la conexión. Revisa tu billetera antes de intentar de nuevo.', ''); });
  });
})();
</script>
</body>
</html>`;
}

function notFoundPage(): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cobro no encontrado</title><style>${STYLE}</style></head>
<body><main><div class="card"><p class="status bad">Cobro no encontrado</p><p class="note">Pídele al vendedor un link o un QR nuevo.</p></div></main></body></html>`;
}
