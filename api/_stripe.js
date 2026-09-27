import { createHmac, timingSafeEqual } from 'node:crypto';

// Cliente mínimo de la API de Stripe (sin SDK). La clave secreta solo existe
// en el servidor; los datos de tarjeta nunca pasan por la tienda.
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Codifica objetos anidados como espera Stripe: a[b][0][c]=valor
export function encodeForm(data, prefix = '') {
  const parts = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') {
      parts.push(encodeForm(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function stripe(method, path, data) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data ? encodeForm(data) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe ${response.status}: ${json.error?.message || 'error'}`);
  }
  return json;
}

const cents = (amount) => Math.round(Number(amount) * 100);

export async function createCheckoutSession({ order, lines, shippingCost, discount, successUrl, cancelUrl }) {
  const lineItems = lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: 'mxn',
      unit_amount: cents(line.unitPrice),
      product_data: { name: line.size ? `${line.name} · Talla ${line.size}` : line.name },
    },
  }));
  if (shippingCost > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: 'mxn', unit_amount: cents(shippingCost), product_data: { name: `Envío (${order.shipping_zone})` } },
    });
  }

  const params = {
    mode: 'payment',
    customer_email: order.email,
    client_reference_id: order.code,
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    locale: 'es',
    metadata: { order_id: String(order.id), order_code: order.code },
    payment_intent_data: { metadata: { order_id: String(order.id), order_code: order.code } },
    line_items: lineItems,
  };

  if (discount > 0) {
    const coupon = await stripe('POST', '/coupons', {
      amount_off: cents(discount),
      currency: 'mxn',
      duration: 'once',
      name: order.promo_code ? `Código ${order.promo_code}`.slice(0, 40) : 'Descuento',
      max_redemptions: 1,
    });
    params.discounts = [{ coupon: coupon.id }];
  }

  return stripe('POST', '/checkout/sessions', params);
}

export function retrieveCheckoutSession(id) {
  return stripe('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}

export async function expireCheckoutSession(id) {
  try {
    await stripe('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`, {});
  } catch {
    // Ya pagada o ya caducada: no hay nada que cancelar.
  }
}

// Verifica la cabecera Stripe-Signature (t=...,v1=...) con el secreto del webhook.
export function verifyStripeSignature(rawBody, header, secret, toleranceSeconds = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    String(header).split(',').map((item) => item.split('=')).filter((pair) => pair.length === 2)
  );
  const timestamp = Number(parts.t);
  const signatures = String(header).split(',').filter((item) => item.startsWith('v1=')).map((item) => item.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signatures.some((signature) => {
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
