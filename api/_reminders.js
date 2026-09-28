import { sql } from './_db.js';
import { cancelOrder, ensureLogisticsSchema, getSetting } from './_logistics.js';
import { syncStripeOrder } from './_payments.js';
import { expireCheckoutSession } from './_stripe.js';
import {
  agentConfigured, connectionState, ensureWhatsappSchema, recordOutgoing, sendWhatsappText, setOutgoingId, splitIntoBubbles,
  typingDelay, upsertConversation,
} from './_whatsapp.js';

// Recordatorios de compra sin terminar por WhatsApp. Un solo mensaje por
// pedido o enlace, en horario razonable, y nunca a quien ya compró después.

const SITE = (process.env.SITE_URL || 'https://samea.shop').replace(/\/$/, '');
const RUN_EVERY_MINUTES = 10;
const ABANDONED_NOTES = ['Pago con tarjeta cancelado por la clienta', 'El pago no se completó a tiempo', 'El pago no se completó'];
const money = (value) => Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const firstName = (name) => String(name || '').trim().split(/\s+/)[0].slice(0, 30);

export async function remindersEnabled() {
  return (await getSetting('wa_cart_reminders')) !== '0';
}

// Solo entre 9:00 y 20:59, hora del centro de México.
export function withinSendingHours(now = new Date()) {
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false }));
  return hour >= 9 && hour < 21;
}

// Teléfono de la compra -> chat de WhatsApp (México: 52 + 10 dígitos).
export function phoneToJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length === 10 || (digits.length === 13 && digits.startsWith('521')) ? `52${digits.slice(-10)}` : digits;
  return number.length >= 11 && number.length <= 15 ? `${number}@s.whatsapp.net` : null;
}

// Enlace que vuelve a llenar el carrito en la tienda.
export function cartLinkFromItems(items = [], promoCode = null) {
  const cart = items
    .filter((item) => item.productId)
    .map((item) => [item.productId, item.size || '', item.quantity].map((part) => encodeURIComponent(String(part))).join(':'))
    .join(',');
  if (!cart) return `${SITE}/`;
  const params = new URLSearchParams({ carrito: cart });
  if (promoCode) params.set('codigo', promoCode);
  return `${SITE}/?${params}`;
}

export function reminderText(kind, data) {
  const hi = data.name ? `Hola, ${data.name}.` : 'Hola.';
  if (kind === 'card') {
    return `${hi} Soy Sam, de SAMÉA.\n\nVi que te quedaste a nada de terminar tu compra (${data.summary}). ¿Tuviste algún problema con el pago?\n\nTe dejo tu carrito listo por si quieres retomarlo: ${data.link}\n\nSi tienes alguna duda de talla o envío, aquí estoy.`;
  }
  if (kind === 'transfer') {
    return `${hi} Soy Sam, de SAMÉA.\n\nTu pedido *${data.code}* sigue apartado esperando tu transferencia de *${data.total}*.${data.bank ? `\n\nTe dejo los datos:\n${data.bank}\nConcepto: ${data.code}` : ''}\n\nEn cuanto la veamos lo preparamos. Si ya la hiciste, mándame tu comprobante por aquí o avísame.`;
  }
  return `${hi}\n\n¿Pudiste ver lo que te mandé? Tu carrito sigue listo aquí: ${data.link}\n\nSi quieres cambiar talla o tienes cualquier duda, me dices y lo ajustamos.`;
}

async function sendReminder({ jid, phone, name }, text) {
  const existing = await sql`
    SELECT jid, mode FROM wa_conversations
    WHERE right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${String(phone).replace(/\D/g, '').slice(-10)}
    ORDER BY last_message_at DESC LIMIT 1`;
  const conversation = existing[0];
  if (conversation?.mode === 'human') return false; // alguien del equipo ya la atiende
  const target = conversation?.jid || jid;
  if (!conversation) await upsertConversation({ jid: target, phone: jid.split('@')[0], name: name || '' });
  for (const bubble of splitIntoBubbles(text, 3)) {
    const rowId = await recordOutgoing(target, 'bot', bubble);
    const id = await sendWhatsappText(target, bubble, typingDelay(bubble));
    await setOutgoingId(rowId, id);
  }
  return true;
}

// ¿Ya hizo otro pedido (pagado o en proceso) después de esta fecha?
async function orderedSince(phone, email, since) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  const rows = await sql`
    SELECT 1 FROM orders
    WHERE created_at > ${since} AND status <> 'cancelled'
      AND (right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${digits} OR (${email || ''} <> '' AND email = ${email || ''}))
    LIMIT 1`;
  return rows.length > 0;
}

async function remindOrders() {
  const candidates = await sql`
    SELECT o.* FROM orders o
    WHERE o.reminder_sent_at IS NULL AND o.paid_at IS NULL
      AND (
        (o.payment_method = 'card' AND o.created_at BETWEEN now() - interval '48 hours' AND now() - interval '1 hour'
          AND o.oxxo_voucher_url IS NULL
          AND (o.status = 'pending_payment' OR (o.status = 'cancelled' AND EXISTS (
            SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.status = 'cancelled' AND e.note = ANY(${ABANDONED_NOTES})))))
        OR (o.payment_method = 'transfer' AND o.status = 'pending_payment'
          AND o.created_at BETWEEN now() - interval '72 hours' AND now() - interval '12 hours')
      )
    ORDER BY o.created_at LIMIT 3`;
  let sent = 0;
  for (let order of candidates) {
    const jid = phoneToJid(order.phone);
    // Se marca primero: si dos procesos corren a la vez, solo uno envía.
    const claimed = await sql`UPDATE orders SET reminder_sent_at = now() WHERE id = ${order.id} AND reminder_sent_at IS NULL RETURNING id`;
    if (!claimed.length || !jid) continue;
    try {
      if (order.payment_method === 'card') {
        order = await syncStripeOrder(order);
        if (order.paid_at || order.status === 'paid' || order.oxxo_voucher_url) continue;
        if (await orderedSince(order.phone, order.email, order.created_at)) continue;
        // Libera lo apartado: el enlace crea un pedido nuevo.
        if (order.status === 'pending_payment') {
          if (order.stripe_session_id) await expireCheckoutSession(order.stripe_session_id);
          order = await syncStripeOrder(order); // por si pagó justo ahora
          if (order.status !== 'pending_payment' && order.status !== 'cancelled') continue;
          if (order.oxxo_voucher_url) continue;
          await cancelOrder(order.id, 'Compra sin terminar: se envió recordatorio por WhatsApp');
        }
        const items = Array.isArray(order.items) ? order.items : [];
        const summary = items.slice(0, 2).map((item) => item.name).join(', ') + (items.length > 2 ? '…' : '');
        const text = reminderText('card', { name: firstName(order.name), summary, link: cartLinkFromItems(items, order.promo_code) });
        if (await sendReminder({ jid, phone: order.phone, name: order.name }, text)) sent += 1;
      } else {
        if (await orderedSince(order.phone, order.email, order.created_at)) continue;
        const bank = (await getSetting('bank_details')).trim();
        const text = reminderText('transfer', { name: firstName(order.name), code: order.code, total: money(order.total), bank });
        if (await sendReminder({ jid, phone: order.phone, name: order.name }, text)) sent += 1;
      }
    } catch (error) {
      console.error('order reminder error', order.code, error.message);
    }
  }
  return sent;
}

// Carritos que Sam mandó por WhatsApp y que no se compraron.
async function remindLinks() {
  const links = await sql`
    SELECT l.* FROM wa_cart_links l
    WHERE l.reminded_at IS NULL AND l.created_at BETWEEN now() - interval '48 hours' AND now() - interval '3 hours'
      AND NOT EXISTS (SELECT 1 FROM wa_messages m WHERE m.jid = l.jid AND m.role = 'customer' AND m.created_at > now() - interval '2 hours')
      AND NOT EXISTS (SELECT 1 FROM wa_cart_links n WHERE n.jid = l.jid AND n.created_at > l.created_at)
    ORDER BY l.created_at LIMIT 3`;
  let sent = 0;
  for (const link of links) {
    const claimed = await sql`UPDATE wa_cart_links SET reminded_at = now() WHERE id = ${link.id} AND reminded_at IS NULL RETURNING id`;
    if (!claimed.length) continue;
    try {
      if (link.phone && (await orderedSince(link.phone, null, link.created_at))) continue;
      const conversation = (await sql`SELECT name, mode FROM wa_conversations WHERE jid = ${link.jid}`)[0];
      if (!conversation || conversation.mode === 'human') continue;
      const text = reminderText('link', { name: '', link: link.url });
      for (const bubble of splitIntoBubbles(text, 3)) {
        const rowId = await recordOutgoing(link.jid, 'bot', bubble);
        await setOutgoingId(rowId, await sendWhatsappText(link.jid, bubble, typingDelay(bubble)));
      }
      sent += 1;
    } catch (error) {
      console.error('link reminder error', link.id, error.message);
    }
  }
  return sent;
}

// Revisa y envía lo pendiente. Se llama seguido (visitas a la tienda, webhook,
// cron diario) pero trabaja como máximo cada RUN_EVERY_MINUTES.
export async function runCartReminders({ force = false } = {}) {
  if (!agentConfigured()) return { skipped: 'not_configured' };
  await Promise.all([ensureLogisticsSchema(), ensureWhatsappSchema()]);
  if (!withinSendingHours()) return { skipped: 'hours' };
  const cutoff = new Date(Date.now() - RUN_EVERY_MINUTES * 60000).toISOString();
  const turn = await sql`
    INSERT INTO settings (key, value) VALUES ('wa_reminders_last_run', ${new Date().toISOString()})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE ${force} OR settings.value < ${cutoff}
    RETURNING key`;
  if (!turn.length) return { skipped: 'recent' };
  if (!(await remindersEnabled())) return { skipped: 'disabled' };
  if ((await connectionState().catch(() => 'unreachable')) !== 'open') return { skipped: 'disconnected' };
  const orders = await remindOrders();
  const links = await remindLinks();
  return { orders, links };
}
