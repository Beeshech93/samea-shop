import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
const L = await import('../api/_logistics.js');
const S = await import('../api/_stripe.js');
const { default: orders } = await import('../api/orders/[action].js');

const ZONES = [
  { id: 1, name: 'Centro', states: ['Ciudad de México', 'Puebla'], price: '99.00', free_from: '899.00', days_min: 2, days_max: 4, active: true },
  { id: 2, name: 'Sin gratis', states: ['Sonora'], price: '150.00', free_from: null, days_min: 5, days_max: 5, active: true },
  { id: 3, name: 'Inactiva', states: ['Yucatán'], price: '50.00', free_from: null, days_min: 1, days_max: 2, active: false },
];

test('las 32 entidades de México', () => {
  assert.equal(L.MX_STATES.length, 32);
  assert.equal(new Set(L.MX_STATES).size, 32);
});

test('zona según el estado (ignora zonas inactivas)', () => {
  assert.equal(L.zoneForState(ZONES, 'Puebla').name, 'Centro');
  assert.equal(L.zoneForState(ZONES, 'Yucatán'), null);
  assert.equal(L.zoneForState(ZONES, 'Jalisco'), null);
});

test('costo de envío con umbral de envío gratis', () => {
  assert.equal(L.shippingCost(ZONES[0], 500), 99);
  assert.equal(L.shippingCost(ZONES[0], 899), 0);
  assert.equal(L.shippingCost(ZONES[1], 5000), 150);
  assert.equal(L.shippingCost(null, 100), null);
  assert.equal(L.shippingDays(ZONES[0]), '2–4 días hábiles');
  assert.equal(L.shippingDays(ZONES[1]), '5 días hábiles');
});

test('validación de datos de envío', () => {
  const ok = { name: 'Ana López', email: 'ANA@x.com', phone: '55 1234 5678', street: 'Av. Reforma 123', neighborhood: 'Juárez', city: 'CDMX', state: 'Ciudad de México', zip: '06600' };
  assert.equal(L.validateCustomer(ok).value.email, 'ana@x.com');
  for (const [field, value] of [['name', 'A'], ['email', 'no'], ['phone', '123'], ['zip', '6600'], ['state', 'Texas'], ['street', 'x']]) {
    assert.ok(L.validateCustomer({ ...ok, [field]: value }).error, field);
  }
});

test('validación de zonas', () => {
  assert.ok(L.validateZone({ name: 'Z', price: 99, daysMin: 2, daysMax: 4, states: ['Puebla'] }).value);
  assert.ok(L.validateZone({ name: 'Z', price: 99, daysMin: 4, daysMax: 2, states: ['Puebla'] }).error);
  assert.ok(L.validateZone({ name: 'Z', price: 99, daysMin: 2, daysMax: 4, states: [] }).error);
  assert.ok(L.validateZone({ name: 'Z', price: 99, daysMin: 2, daysMax: 4, states: ['Texas'] }).error);
});

test('enlaces de rastreo conocidos', () => {
  assert.match(L.trackingLink('dhl', '123 45'), /dhl\.com.*123%2045/);
  assert.match(L.trackingLink('fedex', '999'), /fedex\.com/);
  assert.equal(L.trackingLink('estafeta', '1'), null);
});

test('formulario anidado para Stripe', () => {
  const body = S.encodeForm({ mode: 'payment', line_items: [{ quantity: 2, price_data: { currency: 'mxn', unit_amount: 15900 } }], skip: null });
  assert.equal(decodeURIComponent(body), 'mode=payment&line_items[0][quantity]=2&line_items[0][price_data][currency]=mxn&line_items[0][price_data][unit_amount]=15900');
});

test('firma del webhook de Stripe', () => {
  const secret = 'whsec_test';
  const raw = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.equal(S.verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret), true);
  assert.equal(S.verifyStripeSignature(raw + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(S.verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'otro'), false);
  assert.equal(S.verifyStripeSignature(raw, `t=${t - 3600},v1=${sig}`, secret), false);
  assert.equal(S.verifyStripeSignature(raw, undefined, secret), false);
});

test('ruta de pedidos desconocida responde 404', async () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => {};
  await orders({ method: 'GET', query: { action: 'nada' }, headers: {} }, res);
  assert.equal(res.statusCode, 404);
});

test('página de pago de Stripe personalizada', () => {
  const order = { id: 7, code: 'SAM-1007', email: 'a@b.co', shipping_zone: 'Zona Centro', shipping_days: '2–4 días hábiles' };
  const lines = [
    { name: 'Tanga', size: 'M', quantity: 2, unitPrice: 159, image: 'https://img.example/tanga.jpg' },
    { name: 'Body', size: null, quantity: 1, unitPrice: 379, image: 'http://inseguro/body.jpg' },
  ];
  const base = { order, lines, shippingCost: 99, successUrl: 'https://s/ok', cancelUrl: 'https://s/no' };

  const plain = S.buildCheckoutParams(base);
  assert.deepEqual(plain.payment_method_types, ['card']);
  assert.equal(plain.payment_method_options, undefined);
  assert.equal(plain.locale, 'es-419');
  assert.equal(plain.submit_type, 'pay');
  assert.equal(plain.line_items.length, 3);
  assert.deepEqual(plain.line_items[0].price_data.product_data.images, ['https://img.example/tanga.jpg']);
  assert.match(plain.line_items[0].price_data.product_data.description, /Talla M/);
  assert.equal(plain.line_items[1].price_data.product_data.images, undefined);
  assert.equal(plain.line_items[2].price_data.unit_amount, 9900);
  assert.equal(plain.metadata.order_id, '7');

  const full = S.buildCheckoutParams({ ...base, shippingCost: 0, options: { oxxo: true, installments: true, message: 'Gracias' } });
  assert.deepEqual(full.payment_method_types, ['card', 'oxxo']);
  assert.equal(full.payment_method_options.oxxo.expires_after_days, 3);
  assert.equal(full.payment_method_options.card.installments.enabled, true);
  assert.equal(full.custom_text.submit.message, 'Gracias');
  assert.equal(full.line_items.length, 2);
});
