import { sql } from './_db.js';
import { ensureLogisticsSchema } from './_logistics.js';
import { verifyStripeSignature } from './_stripe.js';
import { refundIfCancelled, syncStripeOrder } from './_payments.js';

// Eventos que pueden cambiar el estado de un pedido. En todos se vuelve a
// consultar a Stripe, que es la fuente de verdad.
const EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

// Stripe firma el cuerpo exacto: hay que leerlo sin procesar.
async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook no configurado.' });

  const raw = await readRawBody(req);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'], secret)) {
    return res.status(400).json({ error: 'Firma no válida.' });
  }

  try {
    const event = JSON.parse(raw);
    if (!EVENTS.has(event.type)) return res.status(200).json({ received: true });
    const session = event.data?.object || {};
    const orderId = Number(session.metadata?.order_id);
    if (!Number.isInteger(orderId)) return res.status(200).json({ received: true });

    await ensureLogisticsSchema();
    const rows = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
    if (rows.length && rows[0].stripe_session_id === session.id) {
      const order = await syncStripeOrder(rows[0]);
      await refundIfCancelled(order);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('stripe webhook error', error);
    return res.status(500).json({ error: 'Error procesando el evento.' });
  }
}
