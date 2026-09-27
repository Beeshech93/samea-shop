import { escapeHtml, mailConfigured, sendMail } from './_mail.js';
import { publicOrder } from './_logistics.js';

const SITE_URL = (process.env.SITE_URL || 'https://samea.shop').replace(/\/$/, '');
const money = (value) => Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function orderLink(order, token) {
  const params = new URLSearchParams({ c: order.code });
  if (token) params.set('t', token);
  return `${SITE_URL}/pedido?${params}`;
}

function itemsHtml(order) {
  return order.items
    .map((item) => `<li>${escapeHtml(item.name)}${item.size ? ` · Talla ${escapeHtml(item.size)}` : ''} × ${item.quantity} — ${money(item.lineTotal)}</li>`)
    .join('');
}

function summaryHtml(order) {
  return `<ul>${itemsHtml(order)}</ul>
<p>Subtotal: ${money(order.subtotal)}${Number(order.discount) ? `<br>Descuento: −${money(order.discount)}` : ''}<br>
Envío (${escapeHtml(order.shipping_zone)}): ${Number(order.shipping_cost) ? money(order.shipping_cost) : 'Gratis'}<br>
<strong>Total: ${money(order.total)}</strong></p>`;
}

const button = (href, label) =>
  `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:#2b2226;color:#fff;text-decoration:none;border-radius:4px">${label}</a></p>`;

// Envío de mejor esfuerzo: si el correo no está configurado o falla, el pedido sigue igual.
export async function sendOrderMail(kind, order, { token, bankDetails } = {}) {
  if (!mailConfigured()) return;
  const view = publicOrder(order);
  const link = orderLink(order, token);
  let subject;
  let body;

  if (kind === 'transfer') {
    subject = `Pedido ${order.code}: datos para tu transferencia`;
    body = `<p>Hola ${escapeHtml(order.name)}, recibimos tu pedido <strong>${order.code}</strong>.</p>
<p>Para confirmarlo, transfiere <strong>${money(order.total)}</strong> a:</p>
<pre style="font-family:inherit;background:#f4e4df;padding:12px;border-radius:4px">${escapeHtml(bankDetails || '')}</pre>
<p>Usa <strong>${order.code}</strong> como concepto. En cuanto veamos el pago lo preparamos.</p>
${summaryHtml(order)}${button(link, 'Ver mi pedido')}`;
  } else if (kind === 'paid') {
    subject = `Pedido ${order.code} confirmado`;
    body = `<p>Hola ${escapeHtml(order.name)}, tu pago se confirmó y ya estamos preparando tu pedido <strong>${order.code}</strong>.</p>
<p>Tiempo estimado de entrega: ${escapeHtml(order.shipping_days)}.</p>
${summaryHtml(order)}${button(link, 'Seguir mi pedido')}`;
  } else if (kind === 'shipped') {
    subject = `Tu pedido ${order.code} va en camino`;
    body = `<p>Hola ${escapeHtml(order.name)}, tu pedido <strong>${order.code}</strong> ya salió.</p>
<p>Paquetería: <strong>${escapeHtml(view.carrier || '')}</strong><br>Número de guía: <strong>${escapeHtml(order.tracking_number || '')}</strong></p>
${view.trackingUrl ? button(view.trackingUrl, 'Rastrear envío') : ''}${button(link, 'Ver mi pedido')}`;
  } else {
    return;
  }

  try {
    await sendMail({
      to: order.email,
      subject,
      html: `${body}<p>SAMÉA · Lencería fina</p>`,
      text: `${subject}\n\nConsulta tu pedido: ${link}\n\nSAMÉA`,
    });
  } catch (error) {
    console.error('order mail error', kind, order.code, error.message);
  }
}
