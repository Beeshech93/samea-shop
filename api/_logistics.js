import { createHash, randomBytes } from 'node:crypto';
import { sql, ensureUsersSchema } from './_db.js';
import { ensureCatalogSchema } from './_catalog.js';

export const MX_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz',
  'Yucatán', 'Zacatecas',
];

const CENTRO = ['Ciudad de México', 'Estado de México', 'Hidalgo', 'Morelos', 'Puebla', 'Querétaro', 'Tlaxcala'];
const EXTENDIDA = ['Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Quintana Roo', 'Yucatán'];
const SEED_ZONES = [
  ['Zona Centro', CENTRO, 99, 2, 4],
  ['Zona Nacional', MX_STATES.filter((s) => !CENTRO.includes(s) && !EXTENDIDA.includes(s)), 139, 3, 6],
  ['Zona Extendida', EXTENDIDA, 179, 5, 8],
];

export const ORDER_STATUSES = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const CARRIERS = {
  estafeta: 'Estafeta',
  dhl: 'DHL',
  fedex: 'FedEx',
  '99minutos': '99 Minutos',
  paquetexpress: 'Paquetexpress',
  redpack: 'Redpack',
  otra: 'Otra',
};

let logisticsReady;
export function ensureLogisticsSchema() {
  logisticsReady ??= (async () => {
    await Promise.all([ensureCatalogSchema(), ensureUsersSchema()]);
    await sql`
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        states TEXT[] NOT NULL DEFAULT '{}',
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        free_from NUMERIC(10, 2),
        days_min INT NOT NULL DEFAULT 2,
        days_max INT NOT NULL DEFAULT 5,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        code TEXT GENERATED ALWAYS AS ('SAM-' || (id + 1000)::text) STORED,
        token_hash TEXT NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        street TEXT NOT NULL,
        neighborhood TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        zip TEXT NOT NULL,
        address_notes TEXT NOT NULL DEFAULT '',
        items JSONB NOT NULL,
        subtotal NUMERIC(10, 2) NOT NULL,
        discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        promo_code TEXT,
        shipping_zone TEXT NOT NULL,
        shipping_cost NUMERIC(10, 2) NOT NULL,
        shipping_days TEXT NOT NULL DEFAULT '',
        total NUMERIC(10, 2) NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'transfer')),
        payment_status TEXT NOT NULL DEFAULT 'pending',
        status TEXT NOT NULL DEFAULT 'pending_payment',
        stripe_session_id TEXT,
        carrier TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        admin_notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        paid_at TIMESTAMPTZ,
        shipped_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ
      )`;
    await sql`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS order_events (
        id BIGSERIAL PRIMARY KEY,
        order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`;

    const seeded = await sql`
      INSERT INTO app_meta (key) VALUES ('zones_seeded')
      ON CONFLICT DO NOTHING RETURNING key`;
    if (seeded.length) {
      for (const [name, states, price, min, max] of SEED_ZONES) {
        await sql`
          INSERT INTO shipping_zones (name, states, price, free_from, days_min, days_max)
          VALUES (${name}, ${states}, ${price}, 899, ${min}, ${max})`;
      }
    }
  })().catch((error) => {
    logisticsReady = undefined;
    throw error;
  });
  return logisticsReady;
}

const round2 = (value) => Math.round(value * 100) / 100;

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function newOrderToken() {
  return randomBytes(24).toString('base64url');
}

// ---------- Envío ----------

export function zoneForState(zones, state) {
  return zones.find((zone) => zone.active && zone.states.includes(state)) || null;
}

// El envío se cobra sobre el importe ya descontado; gratis desde free_from.
export function shippingCost(zone, amount) {
  if (!zone) return null;
  const free = zone.free_from !== null && zone.free_from !== undefined && amount >= Number(zone.free_from);
  return free ? 0 : round2(Number(zone.price));
}

export function shippingDays(zone) {
  return zone.days_min === zone.days_max ? `${zone.days_min} días hábiles` : `${zone.days_min}–${zone.days_max} días hábiles`;
}

export function publicZone(zone) {
  return {
    id: zone.id,
    name: zone.name,
    states: zone.states,
    price: Number(zone.price),
    freeFrom: zone.free_from === null ? null : Number(zone.free_from),
    daysMin: zone.days_min,
    daysMax: zone.days_max,
    active: zone.active,
  };
}

export async function getSetting(key) {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0]?.value || '';
}

export async function setSetting(key, value) {
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

// ---------- Validación ----------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

export function validateCustomer(body = {}) {
  const customer = {
    name: text(body.name, 80),
    email: text(body.email, 254).toLowerCase(),
    phone: text(body.phone, 20),
    street: text(body.street, 120),
    neighborhood: text(body.neighborhood, 80),
    city: text(body.city, 80),
    state: text(body.state, 40),
    zip: text(body.zip, 5),
    addressNotes: text(body.addressNotes, 200),
  };
  if (customer.name.length < 3) return { error: 'Escribe tu nombre completo.' };
  if (!EMAIL_PATTERN.test(customer.email)) return { error: 'Escribe un correo electrónico válido.' };
  const digits = customer.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return { error: 'Escribe un teléfono de 10 dígitos.' };
  if (customer.street.length < 5) return { error: 'Escribe la calle y el número.' };
  if (customer.neighborhood.length < 2) return { error: 'Escribe la colonia.' };
  if (customer.city.length < 2) return { error: 'Escribe la ciudad o municipio.' };
  if (!MX_STATES.includes(customer.state)) return { error: 'Elige un estado.' };
  if (!/^\d{5}$/.test(customer.zip)) return { error: 'El código postal debe tener 5 dígitos.' };
  return { value: customer };
}

export function validateZone(body = {}) {
  const name = text(body.name, 60);
  if (!name) return { error: 'Escribe el nombre de la zona.' };
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'El precio de envío no es válido.' };
  const freeFrom = body.freeFrom === '' || body.freeFrom === null || body.freeFrom === undefined ? null : Number(body.freeFrom);
  if (freeFrom !== null && (!Number.isFinite(freeFrom) || freeFrom < 0)) return { error: '«Gratis desde» no es válido.' };
  const daysMin = Number(body.daysMin);
  const daysMax = Number(body.daysMax);
  if (!Number.isInteger(daysMin) || !Number.isInteger(daysMax) || daysMin < 0 || daysMax < daysMin || daysMax > 60) {
    return { error: 'Los días de entrega no son válidos.' };
  }
  const states = [...new Set(Array.isArray(body.states) ? body.states : [])];
  if (states.length === 0) return { error: 'Elige al menos un estado.' };
  if (states.some((state) => !MX_STATES.includes(state))) return { error: 'Hay un estado no válido.' };
  return {
    value: { name, price: round2(price), freeFrom: freeFrom === null ? null : round2(freeFrom), daysMin, daysMax, states, active: body.active !== false },
  };
}

// ---------- Pedidos ----------

export async function addEvent(orderId, status, note = '') {
  await sql`INSERT INTO order_events (order_id, status, note) VALUES (${orderId}, ${status}, ${note})`;
}

// Resta stock de cada línea; si alguna no alcanza, devuelve lo ya restado.
export async function reserveStock(lines) {
  const done = [];
  for (const line of lines) {
    const rows = await sql`
      UPDATE products SET stock = stock - ${line.quantity}, updated_at = now()
      WHERE id = ${line.productId} AND stock >= ${line.quantity}
      RETURNING id`;
    if (!rows.length) {
      for (const prev of done) {
        await sql`UPDATE products SET stock = stock + ${prev.quantity} WHERE id = ${prev.productId}`;
      }
      return { error: `No hay suficiente stock de ${line.name}${line.size ? ` (talla ${line.size})` : ''}.` };
    }
    done.push(line);
  }
  return { ok: true };
}

export async function releaseStock(items) {
  for (const item of items) {
    await sql`UPDATE products SET stock = stock + ${item.quantity} WHERE id = ${item.productId}`;
  }
}

// Idempotente: solo actúa si el pedido aún no estaba pagado.
export async function markPaid(orderId, note) {
  const rows = await sql`
    UPDATE orders SET payment_status = 'paid', status = 'paid', paid_at = now(), updated_at = now()
    WHERE id = ${orderId} AND payment_status <> 'paid' AND status <> 'cancelled'
    RETURNING *`;
  if (rows.length) await addEvent(orderId, 'paid', note);
  return rows[0] || null;
}

// Idempotente: devuelve el stock solo la primera vez que se cancela.
export async function cancelOrder(orderId, note) {
  const rows = await sql`
    UPDATE orders SET status = 'cancelled', updated_at = now()
    WHERE id = ${orderId} AND status IN ('pending_payment', 'paid', 'preparing')
    RETURNING *`;
  if (!rows.length) return null;
  await releaseStock(rows[0].items);
  await addEvent(orderId, 'cancelled', note);
  return rows[0];
}

export function trackingLink(carrier, number) {
  if (!number) return null;
  const n = encodeURIComponent(number);
  if (carrier === 'dhl') return `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${n}`;
  if (carrier === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  return null;
}

export async function orderEvents(orderId) {
  return sql`SELECT status, note, created_at FROM order_events WHERE order_id = ${orderId} ORDER BY created_at, id`;
}

// Vista del pedido para la clienta (sin notas internas ni ids).
export function publicOrder(order, events = []) {
  return {
    code: order.code,
    status: order.status,
    statusLabel: ORDER_STATUSES[order.status] || order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: {
      street: order.street,
      neighborhood: order.neighborhood,
      city: order.city,
      state: order.state,
      zip: order.zip,
      notes: order.address_notes,
    },
    items: order.items,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    promoCode: order.promo_code,
    shippingZone: order.shipping_zone,
    shippingCost: Number(order.shipping_cost),
    shippingDays: order.shipping_days,
    total: Number(order.total),
    carrier: order.carrier ? CARRIERS[order.carrier] || order.carrier : null,
    trackingNumber: order.tracking_number,
    trackingUrl: order.tracking_url || trackingLink(order.carrier, order.tracking_number),
    createdAt: order.created_at,
    paidAt: order.paid_at,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    events: events.map((event) => ({
      status: event.status,
      label: ORDER_STATUSES[event.status] || event.status,
      note: event.note,
      at: event.created_at,
    })),
  };
}

export function adminOrder(order) {
  return {
    ...publicOrder(order),
    id: order.id,
    carrierKey: order.carrier,
    adminNotes: order.admin_notes,
    userId: order.user_id,
    stripeSessionId: order.stripe_session_id,
    updatedAt: order.updated_at,
  };
}
