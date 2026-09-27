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

// Parámetros de la página de pago de Stripe, personalizados para SAMÉA.
export function buildCheckoutParams({ order, lines, shippingCost, successUrl, cancelUrl, options = {} }) {
  const lineItems = lines.map((line) => {
    const productData = {
      name: line.name,
      description: [line.size ? `Talla ${line.size}` : null, 'SAMÉA · Lencería fina'].filter(Boolean).join(' · '),
    };
    if (typeof line.image === 'string' && line.image.startsWith('https://')) productData.images = [line.image];
    return {
      quantity: line.quantity,
      price_data: { currency: 'mxn', unit_amount: cents(line.unitPrice), product_data: productData },
    };
  });
  if (shippingCost > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: cents(shippingCost),
        product_data: { name: `Envío · ${order.shipping_zone}`, description: `Entrega en ${order.shipping_days}` },
      },
    });
  }

  const methods = ['card'];
  const methodOptions = {};
  if (options.oxxo) {
    methods.push('oxxo');
    methodOptions.oxxo = { expires_after_days: 3 };
  }
  if (options.installments) {
    methodOptions.card = { installments: { enabled: true } };
  }

  const params = {
    mode: 'payment',
    submit_type: 'pay',
    locale: 'es-419',
    customer_email: order.email,
    client_reference_id: order.code,
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    metadata: { order_id: String(order.id), order_code: order.code },
    payment_intent_data: {
      description: `Pedido ${order.code} · SAMÉA`,
      metadata: { order_id: String(order.id), order_code: order.code },
    },
    payment_method_types: methods,
    line_items: lineItems,
  };
  if (Object.keys(methodOptions).length) params.payment_method_options = methodOptions;
  if (options.message) params.custom_text = { submit: { message: options.message.slice(0, 1200) } };
  return params;
}

export async function createCheckoutSession({ order, lines, shippingCost, discount, successUrl, cancelUrl, options = {} }) {
  const params = buildCheckoutParams({ order, lines, shippingCost, successUrl, cancelUrl, options });

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

  try {
    return await stripe('POST', '/checkout/sessions', params);
  } catch (error) {
    // Si la cuenta de Stripe aún no tiene OXXO o meses sin intereses
    // activados, se cobra solo con tarjeta en lugar de fallar.
    if (!options.oxxo && !options.installments) throw error;
    console.error('stripe: reintento solo con tarjeta:', error.message);
    params.payment_method_types = ['card'];
    delete params.payment_method_options;
    return stripe('POST', '/checkout/sessions', params);
  }
}

export function retrieveCheckoutSession(id) {
  return stripe('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}

export function retrievePaymentIntent(id) {
  return stripe('GET', `/payment_intents/${encodeURIComponent(id)}?expand%5B%5D=payment_method`);
}

export function refundPaymentIntent(id) {
  return stripe('POST', '/refunds', { payment_intent: id, reason: 'requested_by_customer' });
}

export function cancelPaymentIntent(id) {
  return stripe('POST', `/payment_intents/${encodeURIComponent(id)}/cancel`, {});
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
