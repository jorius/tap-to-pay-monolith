import PDFDocument from 'pdfkit';
import { formatAmount } from './money.js';
import type { Statement, WalletStatement } from './statement.js';

// The monthly statement as a one-page-per-wallet A4 PDF a vendor can hand to a lender. Standard Helvetica only, so
// accents and ñ render (WinAnsi) and no font file ships; no emoji or arrows, which WinAnsi lacks.

export type StatementLang = 'es' | 'en';

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const CONTENT = PAGE.width - PAGE.margin * 2;
const COLORS = { brand: '#6B2FB3', ink: '#111827', muted: '#4B5563', line: '#E5E7EB', card: '#F5F3FA', bar: '#6B2FB3', out: '#E07A1F', ok: '#17845A', bad: '#BE3535' };

const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const T = {
  es: {
    title: 'Resumen financiero mensual',
    period: (month: string, tz: string) => `${month} · hora de ${tz}`,
    generated: (at: string) => `Generado el ${at}`,
    wallet: 'Billetera que recibe',
    amountsIn: (code: string) => `Montos en ${code}`,
    revenue: 'Ingresos del mes',
    sales: 'Ventas aprobadas',
    average: 'Ticket promedio',
    customers: 'Clientes únicos',
    approval: 'Tasa de aprobación',
    growth: 'Frente al mes anterior',
    noPrevious: 'Sin ventas el mes anterior',
    daily: 'Ingresos por día',
    trend: 'Ingresos de los últimos 6 meses',
    details: 'Detalle',
    median: 'Ticket mediano',
    largest: 'Venta más alta',
    activeDays: 'Días con ventas',
    ofDays: (a: number, n: number) => `${a} de ${n}`,
    perActiveDay: 'Promedio por día con ventas',
    bestDay: 'Mejor día',
    peakHour: 'Hora con más ventas',
    salesN: (n: number) => (n === 1 ? '1 venta' : `${n} ventas`),
    repeat: 'Clientes que repitieron',
    repeatValue: (n: number, pct: string) => `${n} (${pct} de los clientes)`,
    pending: 'Pendientes de confirmar',
    refusals: 'Cobros rechazados',
    channels: 'Canales de cobro',
    previous: 'Mes anterior',
    none: 'Ninguno',
    noSales: 'No hubo ventas aprobadas en este mes.',
    channel: { NFC: 'Toque NFC', LINK: 'Link o QR', RECURRING: 'Pago recurrente' } as Record<string, string>,
    reason: {
      BUYER_UNKNOWN: 'tarjeta no registrada',
      GRANT_MISSING: 'billetera sin autorizar',
      LIMIT_PER_PAYMENT: 'tope por pago',
      LIMIT_DAILY: 'tope diario',
      GRANT_LIMIT: 'límite autorizado',
      WALLET_ERROR: 'error de la billetera',
    } as Record<string, string>,
    footer:
      'Datos del registro de Tap to Pay: cobros que el servicio pidió a las billeteras por Open Payments y lo que respondieron. ' +
      'Los saldos están en la billetera del comercio. Este documento no es un certificado bancario.',
    verification: (code: string) => `Código de verificación: ${code}`,
    page: (n: number, total: number) => `Página ${n} de ${total}`,
    capacity: 'Capacidad de pago',
    capacitySub: (months: number, code: string) =>
      `Últimos 6 meses · ${months === 1 ? '1 mes' : `${months} meses`} con ingresos · montos en ${code}`,
    avgIncome: 'Ingreso mensual promedio',
    minIncome: 'Ingreso del mes más bajo',
    stability: 'Estabilidad de ingresos',
    stabilityLevel: { high: 'Alta', medium: 'Media', low: 'Baja' } as Record<string, string>,
    variation: (pct: string) => `variación ${pct}`,
    avgObligations: 'Obligaciones mensuales promedio',
    ratio: 'Obligaciones sobre ingresos',
    capacityValue: 'Capacidad de pago estimada',
    perMonth: 'por mes',
    monthByMonth: 'Mes a mes',
    columns: ['Mes', 'Ingresos', 'Ventas', 'Días', 'Obligaciones', 'Flujo neto', 'Pagos al día'],
    incomeVsObligations: 'Ingresos y obligaciones pagadas',
    legendIncome: 'Ingresos',
    legendOut: 'Obligaciones',
    history: 'Historial de pagos',
    punctual: (paid: number, total: number, pct: string) =>
      `${paid} de ${total} pagos de servicios hechos a tiempo (${pct}) en los últimos 6 meses.`,
    noHistory:
      'Aún no hay pagos de servicios registrados. Al inscribirlos en Pagos, cada mes pagado a tiempo suma a este historial.',
    growthLine: (pct: string) => `Crecimiento mensual promedio de los ingresos: ${pct}.`,
    obligationsOf: (month: string) => `Obligaciones de ${month}`,
    obligationColumns: ['Fecha', 'Servicio', 'Referencia', 'Monto', 'Estado'],
    noObligations: 'No hubo pagos de servicios este mes.',
    more: (n: number) => `y ${n} más`,
    status: { PAID: 'Pagado', FAILED: 'No pagado', CHARGING: 'En proceso', AWAITING_TAP: '-' } as Record<string, string>,
  },
  en: {
    title: 'Monthly financial statement',
    period: (month: string, tz: string) => `${month} · ${tz} time`,
    generated: (at: string) => `Generated on ${at}`,
    wallet: 'Receiving wallet',
    amountsIn: (code: string) => `Amounts in ${code}`,
    revenue: 'Revenue this month',
    sales: 'Approved sales',
    average: 'Average ticket',
    customers: 'Unique customers',
    approval: 'Approval rate',
    growth: 'Against last month',
    noPrevious: 'No sales last month',
    daily: 'Revenue per day',
    trend: 'Revenue over the last 6 months',
    details: 'Details',
    median: 'Median ticket',
    largest: 'Largest sale',
    activeDays: 'Days with sales',
    ofDays: (a: number, n: number) => `${a} of ${n}`,
    perActiveDay: 'Average per day with sales',
    bestDay: 'Best day',
    peakHour: 'Busiest hour',
    salesN: (n: number) => (n === 1 ? '1 sale' : `${n} sales`),
    repeat: 'Returning customers',
    repeatValue: (n: number, pct: string) => `${n} (${pct} of customers)`,
    pending: 'Awaiting confirmation',
    refusals: 'Refused charges',
    channels: 'Payment channels',
    previous: 'Last month',
    none: 'None',
    noSales: 'There were no approved sales this month.',
    channel: { NFC: 'NFC tap', LINK: 'Link or QR', RECURRING: 'Recurring payment' } as Record<string, string>,
    reason: {
      BUYER_UNKNOWN: 'card not registered',
      GRANT_MISSING: 'wallet not authorized',
      LIMIT_PER_PAYMENT: 'per-payment limit',
      LIMIT_DAILY: 'daily limit',
      GRANT_LIMIT: 'authorized limit',
      WALLET_ERROR: 'wallet error',
    } as Record<string, string>,
    footer:
      "Tap to Pay's records: charges the service asked of the wallets over Open Payments, and their answers. " +
      "Balances are held in the vendor's wallet. This document is not a bank certificate.",
    verification: (code: string) => `Verification code: ${code}`,
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    capacity: 'Payment capacity',
    capacitySub: (months: number, code: string) =>
      `Last 6 months · ${months === 1 ? '1 month' : `${months} months`} with income · amounts in ${code}`,
    avgIncome: 'Average monthly income',
    minIncome: 'Lowest monthly income',
    stability: 'Income stability',
    stabilityLevel: { high: 'High', medium: 'Medium', low: 'Low' } as Record<string, string>,
    variation: (pct: string) => `variation ${pct}`,
    avgObligations: 'Average monthly obligations',
    ratio: 'Obligations to income',
    capacityValue: 'Estimated payment capacity',
    perMonth: 'per month',
    monthByMonth: 'Month by month',
    columns: ['Month', 'Income', 'Sales', 'Days', 'Obligations', 'Net flow', 'Paid on time'],
    incomeVsObligations: 'Income and obligations paid',
    legendIncome: 'Income',
    legendOut: 'Obligations',
    history: 'Payment history',
    punctual: (paid: number, total: number, pct: string) =>
      `${paid} of ${total} bill payments made on time (${pct}) over the last 6 months.`,
    noHistory: 'No bill payments recorded yet. Once enrolled in Bills, every month paid on time adds to this history.',
    growthLine: (pct: string) => `Average monthly income growth: ${pct}.`,
    obligationsOf: (month: string) => `Obligations in ${month}`,
    obligationColumns: ['Date', 'Service', 'Reference', 'Amount', 'Status'],
    noObligations: 'No bill payments this month.',
    more: (n: number) => `and ${n} more`,
    status: { PAID: 'Paid', FAILED: 'Not paid', CHARGING: 'In progress', AWAITING_TAP: '-' } as Record<string, string>,
  },
};

export function renderStatementPdf(statement: Statement, lang: StatementLang): Promise<Buffer> {
  const t = T[lang];
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true, info: { Title: `${t.title} ${statement.month}`, Author: 'Tap to Pay' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const [year, month] = statement.month.split('-').map(Number);
  const monthName = `${MONTHS[lang][month - 1]} ${lang === 'es' ? 'de ' : ''}${year}`;
  const generated = new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', {
    timeZone: statement.timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(statement.generatedAt);

  statement.wallets.forEach((wallet, i) => {
    if (i > 0) doc.addPage();
    // What a lender reads first: income month after month, obligations and what is left; then the month's sales.
    header(doc, t, statement.vendorName, capitalize(t.period(monthName, statement.timeZone)), t.generated(generated));
    capacitySection(doc, t, lang, wallet, monthName);
    doc.addPage();
    header(doc, t, statement.vendorName, capitalize(t.period(monthName, statement.timeZone)), t.generated(generated));
    walletSection(doc, t, lang, wallet);
  });

  // Footers once every page exists, so each knows the total.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    footer(doc, t, statement.verificationCode, i - range.start + 1, range.count);
  }
  doc.end();
  return done;
}

type Doc = PDFKit.PDFDocument;
type Words = (typeof T)['es'];

function header(doc: Doc, t: Words, vendorName: string, period: string, generated: string) {
  doc.rect(0, 0, PAGE.width, 104).fill(COLORS.brand);
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text('TAP TO PAY', PAGE.margin, 26, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(20).text(t.title, PAGE.margin, 42);
  doc.font('Helvetica').fontSize(11).text(`${vendorName} · ${period}`, PAGE.margin, 70, { width: CONTENT });
  doc.fontSize(8).fillColor('#E9DDF8').text(generated, PAGE.margin, 86, { width: CONTENT });
  doc.y = 124;
}

function walletSection(doc: Doc, t: Words, lang: StatementLang, w: WalletStatement) {
  const money = (amount: bigint) => localMoney(amount, w.assetScale, w.assetCode, lang);
  const pct = (value: number) => `${(value * 100).toFixed(value >= 0.1 || value === 0 ? 0 : 1).replace('.', lang === 'es' ? ',' : '.')} %`;

  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(t.wallet, PAGE.margin, doc.y);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(w.publicName ?? w.walletAddress, PAGE.margin, doc.y + 2, { width: CONTENT });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`${w.walletAddress} · ${t.amountsIn(w.assetCode)}`, { width: CONTENT });
  doc.y += 10;

  // Key figures, three by two.
  const growth =
    w.growth.total === null ? t.noPrevious : `${w.growth.total >= 0 ? '+' : '-'}${pct(Math.abs(w.growth.total))}`;
  const kpis: [string, string, string?][] = [
    [t.revenue, money(w.paid.total)],
    [t.sales, String(w.paid.count)],
    [t.average, money(w.averageTicket)],
    [t.customers, String(w.uniqueBuyers)],
    [t.approval, w.approvalRate === null ? '-' : pct(w.approvalRate)],
    [t.growth, growth, w.growth.total === null ? undefined : w.growth.total >= 0 ? COLORS.ok : COLORS.bad],
  ];
  const boxW = (CONTENT - 16) / 3;
  const boxH = 54;
  const top = doc.y;
  kpis.forEach(([label, value, color], i) => {
    const x = PAGE.margin + (i % 3) * (boxW + 8);
    const y = top + Math.floor(i / 3) * (boxH + 8);
    doc.roundedRect(x, y, boxW, boxH, 8).fill(COLORS.card);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(label, x + 10, y + 10, { width: boxW - 20 });
    doc
      .fillColor(color ?? COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(value.length > 18 ? 11 : 14)
      .text(value, x + 10, y + 26, { width: boxW - 20 });
  });
  doc.y = top + 2 * (boxH + 8) + 8;

  if (w.paid.count === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(10).text(t.noSales, PAGE.margin, doc.y);
    doc.y += 8;
  }

  barChart(doc, t.daily, w.daily.map((d) => ({ label: String(d.day), value: d.total })), (v) => money(v), (i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''));
  const shortMonths = MONTHS[lang].map((m) => capitalize(m.slice(0, 3)));
  barChart(doc, t.trend, w.trend.map((m) => ({ label: shortMonths[Number(m.month.slice(5)) - 1], value: m.total })), (v) => money(v), (i, label) => label, true);

  // Details, label and value per row.
  const rows: [string, string][] = [
    [t.median, money(w.medianTicket)],
    [t.largest, money(w.largestSale)],
    [t.activeDays, t.ofDays(w.activeDays, w.daysInMonth)],
    [t.perActiveDay, money(w.averagePerActiveDay)],
    [t.bestDay, w.bestDay ? `${w.bestDay.date} · ${money(w.bestDay.total)} · ${t.salesN(w.bestDay.count)}` : t.none],
    [t.peakHour, w.peakHour ? `${String(w.peakHour.hour).padStart(2, '0')}:00 - ${String(w.peakHour.hour).padStart(2, '0')}:59 · ${t.salesN(w.peakHour.count)}` : t.none],
    [t.repeat, w.uniqueBuyers ? t.repeatValue(w.repeatBuyers, pct(w.repeatBuyers / w.uniqueBuyers)) : t.none],
    [t.pending, w.pending.count ? `${t.salesN(w.pending.count)} · ${money(w.pending.total)}` : t.none],
    [
      t.refusals,
      w.failed.count
        ? `${w.failed.count} (${w.failed.byReason.map((r) => `${t.reason[r.code] ?? r.code}: ${r.count}`).join(', ')})`
        : t.none,
    ],
    [t.channels, w.channels.length ? w.channels.map((c) => `${t.channel[c.channel] ?? c.channel}: ${c.count}`).join(' · ') : t.none],
    [t.previous, `${t.salesN(w.previousMonth.count)} · ${money(w.previousMonth.total)}`],
  ];
  if (doc.y + 26 + rows.length * 17 > PAGE.height - 90) doc.addPage();
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(t.details, PAGE.margin, doc.y);
  doc.y += 6;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(label, PAGE.margin, y, { width: 170 });
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(value, PAGE.margin + 175, y, { width: CONTENT - 175 });
    const next = Math.max(doc.y, y + 12) + 4;
    doc.moveTo(PAGE.margin, next - 2).lineTo(PAGE.margin + CONTENT, next - 2).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.y = next;
  }
}

function capacitySection(doc: Doc, t: Words, lang: StatementLang, w: WalletStatement, monthName: string) {
  const c = w.capacity;
  const money = (amount: bigint) => localMoney(amount, w.assetScale, w.assetCode, lang);
  const pct = (value: number) => `${(value * 100).toFixed(Math.abs(value) >= 0.1 || value === 0 ? 0 : 1).replace('.', lang === 'es' ? ',' : '.')} %`;
  const shortMonths = MONTHS[lang].map((m) => capitalize(m.slice(0, 3)));
  const monthLabel = (key: string) => `${shortMonths[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`;

  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(t.wallet, PAGE.margin, doc.y);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10).text(`${w.publicName ?? w.walletAddress} · ${w.walletAddress}`, PAGE.margin, doc.y + 1, { width: CONTENT });
  doc.y += 8;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(15).text(t.capacity, PAGE.margin, doc.y);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(t.capacitySub(c.historyMonths, w.assetCode), { width: CONTENT });
  doc.y += 8;

  kpiGrid(doc, [
    [t.avgIncome, money(c.averageIncome)],
    [t.minIncome, money(c.minimumIncome)],
    [t.stability, c.stability ? `${t.stabilityLevel[c.stability]} · ${t.variation(pct(c.variation!))}` : '-'],
    [t.avgObligations, money(c.averageObligations)],
    [t.ratio, c.obligationRatio === null ? '-' : pct(c.obligationRatio)],
    [t.capacityValue, `${money(c.estimatedCapacity)} ${t.perMonth}`, c.estimatedCapacity > 0n ? COLORS.ok : COLORS.bad],
  ]);

  // Month by month.
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(t.monthByMonth, PAGE.margin, doc.y);
  doc.y += 4;
  const widths = [52, 92, 42, 34, 92, 92, 95];
  const row = (cells: string[], bold = false, color = COLORS.ink) => {
    const y = doc.y;
    let x = PAGE.margin;
    cells.forEach((cell, i) => {
      doc.fillColor(i === 0 || bold ? color : COLORS.ink).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(cell, x, y, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right' });
      x += widths[i];
    });
    doc.y = y + 15;
    doc.moveTo(PAGE.margin, doc.y - 3).lineTo(PAGE.margin + CONTENT, doc.y - 3).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  };
  row(t.columns, true, COLORS.muted);
  for (const m of c.months) {
    const total = m.obligationsCount + m.obligationsMissed;
    row([
      monthLabel(m.month),
      money(m.income),
      String(m.sales),
      String(m.activeDays),
      money(m.obligationsPaid),
      money(m.net),
      total ? `${m.obligationsCount} de ${total}`.replace(' de ', lang === 'es' ? ' de ' : ' of ') : '-',
    ]);
  }
  doc.y += 8;

  groupedChart(doc, t, c.months.map((m) => ({ label: monthLabel(m.month), income: m.income, out: m.obligationsPaid })), money);

  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(t.history, PAGE.margin, doc.y);
  const { paid, missed, rate } = c.punctuality;
  doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9)
    .text(rate === null ? t.noHistory : t.punctual(paid, paid + missed, pct(rate)), PAGE.margin, doc.y + 2, { width: CONTENT });
  if (c.averageGrowth !== null) {
    doc.text(t.growthLine(`${c.averageGrowth >= 0 ? '+' : '-'}${pct(Math.abs(c.averageGrowth))}`), { width: CONTENT });
  }
  doc.y += 8;

  // This month's obligations.
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(t.obligationsOf(monthName), PAGE.margin, doc.y);
  doc.y += 4;
  if (w.obligations.length === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(9).text(t.noObligations, PAGE.margin, doc.y);
    return;
  }
  const oWidths = [70, 130, 120, 110, 69];
  const date = new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'short' });
  const oRow = (cells: string[], bold = false, colors: string[] = []) => {
    const y = doc.y;
    let x = PAGE.margin;
    cells.forEach((cell, i) => {
      doc.fillColor(colors[i] ?? (bold ? COLORS.muted : COLORS.ink)).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(cell, x, y, { width: oWidths[i] - 4, align: i >= 3 ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += oWidths[i];
    });
    doc.y = y + 14;
  };
  oRow(t.obligationColumns, true);
  const room = Math.max(1, Math.floor((PAGE.height - 92 - doc.y) / 14) - 1);
  for (const o of w.obligations.slice(0, room)) {
    oRow(
      [date.format(o.date), o.payee, o.reference ?? '-', localMoney(o.amount, o.assetScale, o.assetCode, lang), t.status[o.status] ?? o.status],
      false,
      [COLORS.ink, COLORS.ink, COLORS.ink, COLORS.ink, o.status === 'PAID' ? COLORS.ok : COLORS.bad],
    );
  }
  if (w.obligations.length > room) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(t.more(w.obligations.length - room), PAGE.margin, doc.y);
  }
}

function kpiGrid(doc: Doc, kpis: [string, string, string?][]) {
  const boxW = (CONTENT - 16) / 3;
  const boxH = 54;
  const top = doc.y;
  kpis.forEach(([label, value, color], i) => {
    const x = PAGE.margin + (i % 3) * (boxW + 8);
    const y = top + Math.floor(i / 3) * (boxH + 8);
    doc.roundedRect(x, y, boxW, boxH, 8).fill(COLORS.card);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(label, x + 10, y + 10, { width: boxW - 20 });
    doc.fillColor(color ?? COLORS.ink).font('Helvetica-Bold').fontSize(value.length > 18 ? 10.5 : 14).text(value, x + 10, y + 26, { width: boxW - 20 });
  });
  doc.y = top + Math.ceil(kpis.length / 3) * (boxH + 8) + 8;
}

function groupedChart(doc: Doc, t: Words, bars: { label: string; income: bigint; out: bigint }[], format: (v: bigint) => string) {
  const height = 70;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(t.incomeVsObligations, PAGE.margin, doc.y);
  // Legend, right-aligned on the title line.
  const legendY = doc.y - 11;
  doc.rect(PAGE.margin + CONTENT - 150, legendY + 1, 8, 8).fill(COLORS.bar);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(t.legendIncome, PAGE.margin + CONTENT - 138, legendY + 1);
  doc.rect(PAGE.margin + CONTENT - 80, legendY + 1, 8, 8).fill(COLORS.out);
  doc.fillColor(COLORS.muted).text(t.legendOut, PAGE.margin + CONTENT - 68, legendY + 1);
  const max = bars.reduce((m, b) => (b.income > m ? b.income : b.out > m ? b.out : m), 0n);
  const top = doc.y + 6;
  const base = top + height;
  const slot = CONTENT / bars.length;
  const barW = slot * 0.28;
  doc.moveTo(PAGE.margin, base).lineTo(PAGE.margin + CONTENT, base).lineWidth(0.6).strokeColor(COLORS.line).stroke();
  const h = (v: bigint) => (max > 0n ? (Number((v * 1000n) / max) / 1000) * (height - 10) : 0);
  bars.forEach((bar, i) => {
    const x = PAGE.margin + i * slot + slot / 2 - barW - 1;
    if (h(bar.income) > 0) doc.rect(x, base - h(bar.income), barW, h(bar.income)).fill(COLORS.bar);
    if (h(bar.out) > 0) doc.rect(x + barW + 2, base - h(bar.out), barW, h(bar.out)).fill(COLORS.out);
    if (bar.income > 0n) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6).text(format(bar.income), PAGE.margin + i * slot, base - h(bar.income) - 9, { width: slot, align: 'center' });
    }
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(bar.label, PAGE.margin + i * slot, base + 3, { width: slot, align: 'center' });
  });
  doc.y = base + 20;
}

function barChart(
  doc: Doc,
  title: string,
  bars: { label: string; value: bigint }[],
  format: (v: bigint) => string,
  tick: (i: number, label: string) => string,
  valueLabels = false,
) {
  const height = 70;
  if (doc.y + height + 40 > PAGE.height - 90) doc.addPage();
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(title, PAGE.margin, doc.y);
  const max = bars.reduce((m, b) => (b.value > m ? b.value : m), 0n);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`max ${format(max)}`, PAGE.margin, doc.y - 11, { width: CONTENT, align: 'right' });
  const top = doc.y + 6;
  const base = top + height;
  const slot = CONTENT / bars.length;
  const barW = Math.max(2, slot * (valueLabels ? 0.5 : 0.7));
  doc.moveTo(PAGE.margin, base).lineTo(PAGE.margin + CONTENT, base).lineWidth(0.6).strokeColor(COLORS.line).stroke();
  bars.forEach((bar, i) => {
    const x = PAGE.margin + i * slot + (slot - barW) / 2;
    const h = max > 0n ? Number((bar.value * 1000n) / max) / 1000 * (height - (valueLabels ? 12 : 0)) : 0;
    if (h > 0) doc.rect(x, base - h, barW, h).fill(COLORS.bar);
    if (valueLabels && bar.value > 0n) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text(format(bar.value), PAGE.margin + i * slot, base - h - 10, { width: slot, align: 'center' });
    }
    const label = tick(i, bar.label);
    if (label) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(label, PAGE.margin + i * slot - 4, base + 3, { width: slot + 8, align: 'center' });
  });
  doc.y = base + 20;
}

function footer(doc: Doc, t: Words, code: string, page: number, total: number) {
  const y = PAGE.height - 70;
  // Writing below the bottom margin would make pdfkit add a page; lift the margin while the footer is drawn.
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(PAGE.margin, y - 8).lineTo(PAGE.margin + CONTENT, y - 8).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(t.footer, PAGE.margin, y, { width: CONTENT });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink).text(t.verification(code), PAGE.margin, y + 28);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(t.page(page, total), PAGE.margin, y + 28, { width: CONTENT, align: 'right' });
  doc.page.margins.bottom = bottom;
}

/** As the app shows money: es-CO "1.234,50 COP", en-US "1,234.50 COP". */
function localMoney(amount: bigint, scale: number, assetCode: string, lang: StatementLang): string {
  const [whole, fraction] = formatAmount(amount, scale).split('.');
  const [group, decimal] = lang === 'es' ? ['.', ','] : [',', '.'];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${fraction === undefined ? grouped : grouped + decimal + fraction} ${assetCode}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
