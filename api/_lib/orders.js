import { sql } from '../_db.js';
import { quoteCart } from '../_catalog.js';
import { getSessionUser } from '../_auth.js';
import { clientIp, isLimited, recordAttempt, tooMany } from '../_ratelimit.js';
import {
  MX_STATES, addEvent, cancelOrder, ensureLogisticsSchema, getSetting, hashToken, markPaid, newOrderToken,
  orderEvents, publicOrder, publicZone, releaseStock, reserveStock, shippingCost, shippingDays, validateCustomer,
  zoneForState,
} from '../_logistics.js';
import { createCheckoutSession, expireCheckoutSession, retrieveCheckoutSession, stripeConfigured } from '../_stripe.js';
import { sendOrderMail } from '../_order-mail.js';

const round2 = (value) => Math.round(value * 100) / 100;

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `https://${host}` : (process.env.SITE_URL || 'https://samea.shop');
}

async function activeZones() {
  const rows = await sql`SELECT * FROM shipping_zones WHERE active ORDER BY price, id`;
  return rows;
}

async function paymentOptions() {
  const bankDetails = await getSetting('bank_details');
  return { card: stripeConfigured(), transfer: Boolean(bankDetails.trim()), bankDetails };
}

// Totales del pedido: carrito (precios de la base) + envío según el estado.
async function priceOrder(items, code, state) {
  const quote = await quoteCart(items, code);
  if (quote.error && !quote.lines) return { error: quote.error };
  const zones = await activeZones();
  const zone = state ? zoneForState(zones, state) : null;
  const afterDiscount = round2(quote.subtotal - quote.discount);
  const shipping = zone ? shippingCost(zone, afterDiscount) : null;
  return {
    quote,
    zone,
    shipping,
    total: round2(afterDiscount + (shipping || 0)),
    shippingError: state && !zone ? `Por ahora no enviamos a ${state}.` : null,
  };
}

// Si el pedido con tarjeta sigue pendiente, pregunta a Stripe por el pago.
async function syncCardPayment(order) {
  if (order.payment_method !== 'card' || order.status !== 'pending_payment' || !order.stripe_session_id || !stripeConfigured()) {
    return order;
  }
  try {
    const session = await retrieveCheckoutSession(order.stripe_session_id);
    if (session.payment_status === 'paid') {
      const paid = await markPaid(order.id, 'Pago con tarjeta confirmado');
      if (paid) await sendOrderMail('paid', paid);
      return paid || order;
    }
    if (session.status === 'expired') {
      return (await cancelOrder(order.id, 'El pago con tarjeta no se completó a tiempo')) || order;
    }
  } catch (error) {
    console.error('stripe sync error', order.code, error.message);
  }
  return order;
}

// Acceso al pedido: con el token del enlace, o con la sesión de su dueña.
async function findOrder(req, code, token) {
  if (!/^SAM-\d+$/.test(String(code || ''))) return null;
  const rows = await sql`SELECT * FROM orders WHERE code = ${code}`;
  const order = rows[0];
  if (!order) return null;
  if (token && hashToken(token) === order.token_hash) return order;
  const user = await getSessionUser(req);
  if (user && order.user_id === user.id) return order;
  return null;
}

async function orderResponse(order) {
  const view = publicOrder(order, await orderEvents(order.id));
  if (order.payment_method === 'transfer' && order.status === 'pending_payment') {
    view.bankDetails = await getSetting('bank_details');
  }
  return view;
}

// ---------- Rutas ----------

export async function options(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
  const zones = await activeZones();
  const payments = await paymentOptions();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    states: MX_STATES,
    zones: zones.map(publicZone),
    payments: { card: payments.card, transfer: payments.transfer },
  });
}

export async function quote(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const priced = await priceOrder(req.body?.items, req.body?.code, req.body?.state);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const { quote: q, zone, shipping, total, shippingError } = priced;
  return res.status(200).json({
    lines: q.lines,
    subtotal: q.subtotal,
    discount: q.discount,
    promotion: q.promotion,
    promoError: q.error || null,
    shipping: zone ? { zone: zone.name, cost: shipping, days: shippingDays(zone), freeFrom: zone.free_from === null ? null : Number(zone.free_from) } : null,
    shippingError,
    total,
  });
}

export async function create(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const body = req.body || {};

  const ipKey = `order:ip:${clientIp(req)}`;
  if (await isLimited([{ key: ipKey, limit: 10, minutes: 60 }])) return tooMany(res, 60);

  const { value: customer, error: customerError } = validateCustomer(body.customer);
  if (customerError) return res.status(400).json({ error: customerError });

  const payments = await paymentOptions();
  const method = body.paymentMethod;
  if (!['card', 'transfer'].includes(method) || !payments[method]) {
    return res.status(400).json({ error: 'Elige un método de pago disponible.' });
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const priced = await priceOrder(body.items, code, customer.state);
  if (priced.error) return res.status(400).json({ error: priced.error });
  if (code && priced.quote.error) return res.status(400).json({ error: priced.quote.error });
  if (!priced.zone) return res.status(400).json({ error: priced.shippingError || 'Elige un estado.' });

  await recordAttempt(ipKey);
  const { quote: q, zone, shipping, total } = priced;
  const items = q.lines.map(({ category, ...line }) => line);

  const reserved = await reserveStock(items);
  if (reserved.error) return res.status(409).json({ error: reserved.error });

  const user = await getSessionUser(req).catch(() => null);
  const token = newOrderToken();
  let order;
  try {
    const rows = await sql`
      INSERT INTO orders (
        token_hash, user_id, name, email, phone, street, neighborhood, city, state, zip, address_notes,
        items, subtotal, discount, promo_code, shipping_zone, shipping_cost, shipping_days, total, payment_method
      ) VALUES (
        ${hashToken(token)}, ${user?.id || null}, ${customer.name}, ${customer.email}, ${customer.phone},
        ${customer.street}, ${customer.neighborhood}, ${customer.city}, ${customer.state}, ${customer.zip},
        ${customer.addressNotes}, ${JSON.stringify(items)}, ${q.subtotal}, ${q.discount}, ${q.promotion?.code || null},
        ${zone.name}, ${shipping}, ${shippingDays(zone)}, ${total}, ${method}
      ) RETURNING *`;
    order = rows[0];
  } catch (error) {
    await releaseStock(items);
    throw error;
  }
  await addEvent(order.id, 'pending_payment', method === 'card' ? 'Pedido creado, esperando pago con tarjeta' : 'Pedido creado, esperando transferencia');

  const origin = siteOrigin(req);
  const orderUrl = `/pedido.html?c=${encodeURIComponent(order.code)}&t=${encodeURIComponent(token)}`;

  if (method === 'card') {
    try {
      const session = await createCheckoutSession({
        order,
        lines: items,
        shippingCost: shipping,
        discount: q.discount,
        successUrl: `${origin}${orderUrl}&pago=ok`,
        cancelUrl: `${origin}/checkout.html?cancelado=${encodeURIComponent(order.code)}&t=${encodeURIComponent(token)}`,
      });
      await sql`UPDATE orders SET stripe_session_id = ${session.id} WHERE id = ${order.id}`;
      return res.status(201).json({ code: order.code, token, redirectUrl: session.url });
    } catch (error) {
      console.error('stripe session error', order.code, error.message);
      await cancelOrder(order.id, 'No se pudo iniciar el pago con tarjeta');
      return res.status(502).json({ error: 'No se pudo iniciar el pago con tarjeta. Inténtalo de nuevo o paga por transferencia.' });
    }
  }

  await sendOrderMail('transfer', order, { token, bankDetails: payments.bankDetails });
  return res.status(201).json({ code: order.code, token, redirectUrl: orderUrl });
}

export async function track(req, res) {
  const source = req.method === 'POST' ? req.body || {} : req.query || {};
  let order = await findOrder(req, source.c, source.t);

  // Alternativa sin enlace: número de pedido + correo (limitado contra adivinanzas).
  if (!order && req.method === 'POST' && source.email) {
    const ipKey = `track:ip:${clientIp(req)}`;
    if (await isLimited([{ key: ipKey, limit: 10, minutes: 30 }])) return tooMany(res, 30);
    const rows = /^SAM-\d+$/.test(String(source.c || ''))
      ? await sql`SELECT * FROM orders WHERE code = ${source.c} AND email = ${String(source.email).trim().toLowerCase()}`
      : [];
    order = rows[0] || null;
    if (!order) await recordAttempt(ipKey);
  }

  if (!order) return res.status(404).json({ error: 'No encontramos ese pedido. Revisa el número y el correo.' });
  order = await syncCardPayment(order);
  return res.status(200).json({ order: await orderResponse(order) });
}

export async function abandon(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const order = await findOrder(req, req.body?.c, req.body?.t);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const synced = await syncCardPayment(order);
  if (synced.payment_method === 'card' && synced.status === 'pending_payment') {
    if (synced.stripe_session_id) await expireCheckoutSession(synced.stripe_session_id);
    await cancelOrder(synced.id, 'Pago con tarjeta cancelado por la clienta');
  }
  return res.status(200).json({ ok: true });
}

export async function mine(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión para ver tus pedidos.' });
  const rows = await sql`SELECT * FROM orders WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
  return res.status(200).json({ orders: rows.map((order) => publicOrder(order)) });
}

export const routes = { options, quote, create, track, abandon, mine };

export async function handle(req, res) {
  const route = Object.hasOwn(routes, req.query?.action) ? routes[req.query.action] : null;
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada.' });
  try {
    await ensureLogisticsSchema();
    return await route(req, res);
  } catch (error) {
    console.error('orders api error', req.query.action, error);
    return res.status(500).json({ error: 'No se pudo completar la operación. Inténtalo más tarde.' });
  }
}
