import { sql } from './_db.js';
import { addEvent, cancelOrder, getSetting, markPaid, setSetting } from './_logistics.js';
import {
  cancelPaymentIntent, expireCheckoutSession, refundPaymentIntent, retrieveCheckoutSession, retrievePaymentIntent,
  stripeConfigured,
} from './_stripe.js';
import { sendOrderMail } from './_order-mail.js';

// Opciones de pago que la administradora controla desde el panel.
export async function getPaymentSettings() {
  const [bankDetails, oxxo, installments, message] = await Promise.all([
    getSetting('bank_details'),
    getSetting('stripe_oxxo'),
    getSetting('stripe_installments'),
    getSetting('stripe_message'),
  ]);
  return {
    stripeConfigured: stripeConfigured(),
    bankDetails,
    oxxo: oxxo === '1',
    installments: installments === '1',
    message,
  };
}

export async function savePaymentSettings(body = {}) {
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  await setSetting('bank_details', text(body.bankDetails, 1000));
  await setSetting('stripe_oxxo', body.oxxo ? '1' : '0');
  await setSetting('stripe_installments', body.installments ? '1' : '0');
  await setSetting('stripe_message', text(body.message, 500));
  return getPaymentSettings();
}

const METHOD_LABEL = { card: 'tarjeta', oxxo: 'OXXO' };

async function confirmPaid(order, method) {
  const paid = await markPaid(order.id, `Pago con ${METHOD_LABEL[method] || 'Stripe'} confirmado`);
  if (paid) await sendOrderMail('paid', paid);
  return paid;
}

// Consulta a Stripe el estado real de un pedido pendiente y lo actualiza.
// La usan el checkout, el panel y el webhook: el resultado es el mismo sin
// importar quién pregunte primero, y cada paso es idempotente.
export async function syncStripeOrder(order) {
  if (order.payment_method !== 'card' || order.status !== 'pending_payment' || !order.stripe_session_id || !stripeConfigured()) {
    return order;
  }
  try {
    const session = await retrieveCheckoutSession(order.stripe_session_id);
    const intent = session.payment_intent ? await retrievePaymentIntent(session.payment_intent) : null;
    const method = intent?.payment_method?.type || (intent?.next_action?.type === 'oxxo_display_details' ? 'oxxo' : null);
    if (method && method !== order.stripe_method) {
      await sql`UPDATE orders SET stripe_method = ${method} WHERE id = ${order.id}`;
    }

    if (session.payment_status === 'paid' || intent?.status === 'succeeded') {
      return (await confirmPaid(order, method)) || order;
    }
    if (session.status === 'expired') {
      return (await cancelOrder(order.id, 'El pago no se completó a tiempo')) || order;
    }

    // Checkout terminado pero sin cobrar: ficha OXXO pendiente de pago.
    if (session.status === 'complete' && intent) {
      if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
        return (await cancelOrder(order.id, method === 'oxxo' ? 'La ficha OXXO venció sin pagarse' : 'El pago no se completó')) || order;
      }
      const oxxo = intent.next_action?.oxxo_display_details;
      if (oxxo && !order.oxxo_voucher_url) {
        const expires = oxxo.expires_after ? new Date(oxxo.expires_after * 1000).toISOString() : null;
        const rows = await sql`
          UPDATE orders SET stripe_method = 'oxxo', oxxo_voucher_url = ${oxxo.hosted_voucher_url || null},
            oxxo_expires_at = ${expires}, updated_at = now()
          WHERE id = ${order.id} RETURNING *`;
        await addEvent(order.id, 'pending_payment', 'Ficha OXXO generada, esperando el pago en tienda');
        return rows[0] || order;
      }
    }
  } catch (error) {
    console.error('stripe sync error', order.code, error.message);
  }
  const fresh = await sql`SELECT * FROM orders WHERE id = ${order.id}`;
  return fresh[0] || order;
}

const intentId = (session) => (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id);

async function markRefunded(order, amountNote) {
  await sql`UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = ${order.id}`;
  await addEvent(order.id, 'cancelled', amountNote);
}

// Antes de cancelar un pedido de Stripe: si ya se cobró, lo reembolsa; si
// sigue pendiente (sesión abierta o ficha OXXO), lo anula para que no se
// pueda pagar después. Lanza error si Stripe no lo permite.
export async function voidStripePayment(order) {
  if (order.payment_method !== 'card' || !order.stripe_session_id || !stripeConfigured()) return { action: 'none' };
  const session = await retrieveCheckoutSession(order.stripe_session_id);
  if (session.status === 'open') {
    await expireCheckoutSession(session.id);
    return { action: 'expired' };
  }
  const id = intentId(session);
  if (!id) return { action: 'none' };
  const intent = await retrievePaymentIntent(id);
  if (intent.status === 'succeeded') {
    if (order.payment_status !== 'refunded') {
      await refundPaymentIntent(id);
      await markRefunded(order, `Reembolso de ${Number(order.total).toFixed(2)} MXN enviado con Stripe`);
    }
    return { action: 'refunded' };
  }
  if (['requires_action', 'requires_payment_method', 'requires_confirmation', 'requires_capture'].includes(intent.status)) {
    await cancelPaymentIntent(id);
    return { action: 'cancelled' };
  }
  return { action: 'none' };
}

// Si Stripe cobra un pedido que ya estaba cancelado (p. ej. una ficha OXXO
// pagada justo al vencer), se devuelve el dinero automáticamente.
export async function refundIfCancelled(order) {
  if (order.status !== 'cancelled' || order.payment_status === 'refunded' || !order.stripe_session_id || !stripeConfigured()) return false;
  const session = await retrieveCheckoutSession(order.stripe_session_id);
  const id = intentId(session);
  if (!id || session.payment_status !== 'paid') return false;
  await refundPaymentIntent(id);
  await markRefunded(order, 'Pago recibido en un pedido cancelado: reembolsado automáticamente con Stripe');
  return true;
}
