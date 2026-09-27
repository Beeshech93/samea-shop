import { sql } from '../../_db.js';
import { requireAdmin } from '../../_admin.js';
import {
  CARRIERS, ORDER_STATUSES, addEvent, adminOrder, cancelOrder, ensureLogisticsSchema, markPaid, orderEvents,
} from '../../_logistics.js';
import { expireCheckoutSession, stripeConfigured } from '../../_stripe.js';
import { syncStripeOrder } from '../../_payments.js';
import { sendOrderMail } from '../../_order-mail.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureLogisticsSchema();

    if (req.method === 'GET') {
      if (req.query?.id) {
        const rows = await sql`SELECT * FROM orders WHERE id = ${Number(req.query.id)}`;
        if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado.' });
        const view = adminOrder(rows[0]);
        view.events = (await orderEvents(rows[0].id)).map((event) => ({
          status: event.status, label: ORDER_STATUSES[event.status] || event.status, note: event.note, at: event.created_at,
        }));
        return res.status(200).json({ order: view });
      }
      const rows = await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 300`;
      return res.status(200).json({ orders: rows.map(adminOrder), statuses: ORDER_STATUSES, carriers: CARRIERS });
    }

    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'GET, PATCH');
      return res.status(405).json({ error: 'Método no permitido.' });
    }

    const id = Number(req.body?.id);
    const rows = Number.isInteger(id) ? await sql`SELECT * FROM orders WHERE id = ${id}` : [];
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const note = text(req.body?.note, 300);

    switch (req.body?.action) {
      case 'mark_paid': {
        if (order.status !== 'pending_payment') return res.status(400).json({ error: 'El pedido no está pendiente de pago.' });
        const paid = await markPaid(id, note || (order.payment_method === 'transfer' ? 'Transferencia recibida' : 'Pago confirmado manualmente'));
        if (paid) await sendOrderMail('paid', paid);
        break;
      }
      case 'verify_payment': {
        if (order.payment_method !== 'card' || !order.stripe_session_id || !stripeConfigured()) {
          return res.status(400).json({ error: 'Este pedido no tiene pago con tarjeta que verificar.' });
        }
        const synced = await syncStripeOrder(order);
        if (synced.status === 'pending_payment') {
          const message = synced.oxxo_voucher_url
            ? 'La clienta generó una ficha OXXO y aún no la ha pagado.'
            : 'Stripe indica que el pago aún no se ha completado.';
          return res.status(200).json({ ok: true, message, order: adminOrder(synced) });
        }
        break;
      }
      case 'preparing': {
        if (order.status !== 'paid') return res.status(400).json({ error: 'Solo se preparan pedidos pagados.' });
        await sql`UPDATE orders SET status = 'preparing', updated_at = now() WHERE id = ${id}`;
        await addEvent(id, 'preparing', note);
        break;
      }
      case 'ship': {
        if (!['paid', 'preparing'].includes(order.status)) return res.status(400).json({ error: 'Solo se envían pedidos pagados.' });
        const carrier = Object.hasOwn(CARRIERS, req.body?.carrier) ? req.body.carrier : null;
        const trackingNumber = text(req.body?.trackingNumber, 60);
        const trackingUrl = text(req.body?.trackingUrl, 500);
        if (!carrier) return res.status(400).json({ error: 'Elige la paquetería.' });
        if (!trackingNumber) return res.status(400).json({ error: 'Escribe el número de guía.' });
        if (trackingUrl && !/^https:\/\/\S+$/i.test(trackingUrl)) return res.status(400).json({ error: 'El enlace de rastreo debe empezar por https://' });
        const updated = await sql`
          UPDATE orders SET status = 'shipped', carrier = ${carrier}, tracking_number = ${trackingNumber},
            tracking_url = ${trackingUrl || null}, shipped_at = now(), updated_at = now()
          WHERE id = ${id} RETURNING *`;
        await addEvent(id, 'shipped', note || `${CARRIERS[carrier]} · guía ${trackingNumber}`);
        await sendOrderMail('shipped', updated[0]);
        break;
      }
      case 'deliver': {
        if (order.status !== 'shipped') return res.status(400).json({ error: 'Solo se entregan pedidos enviados.' });
        await sql`UPDATE orders SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = ${id}`;
        await addEvent(id, 'delivered', note);
        break;
      }
      case 'cancel': {
        if (!['pending_payment', 'paid', 'preparing'].includes(order.status)) {
          return res.status(400).json({ error: 'Este pedido ya no se puede cancelar.' });
        }
        if (order.stripe_session_id && order.status === 'pending_payment' && !order.oxxo_voucher_url) {
          await expireCheckoutSession(order.stripe_session_id);
        }
        await cancelOrder(id, note || 'Cancelado desde el panel');
        break;
      }
      case 'notes': {
        await sql`UPDATE orders SET admin_notes = ${text(req.body?.adminNotes, 1000)}, updated_at = now() WHERE id = ${id}`;
        break;
      }
      default:
        return res.status(400).json({ error: 'Acción no válida.' });
    }

    const fresh = await sql`SELECT * FROM orders WHERE id = ${id}`;
    return res.status(200).json({ order: adminOrder(fresh[0]) });
  } catch (error) {
    console.error('admin orders error', error);
    return res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
  }
}
