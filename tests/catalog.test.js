import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
const { quoteCart, unitPrice, validateProduct, validatePromotion } = await import('../api/_catalog.js');

const PRODUCTS = [
  { id: 1, name: 'Tanga', category: 'panties', price: '159.00', discount_percent: 0, sizes: ['S', 'M'] },
  { id: 2, name: 'Body', category: 'conjuntos', price: '379.00', discount_percent: 20, sizes: ['S', 'M'] },
  { id: 3, name: 'Aroma', category: 'accesorios', price: '100.00', discount_percent: 0, sizes: [] },
];
const PROMOS = {
  APP10: { code: 'APP10', description: '10%', kind: 'percent', value: '10', min_subtotal: '0', category: null },
  LOOKS15: { code: 'LOOKS15', description: 'looks', kind: 'percent', value: '15', min_subtotal: '0', category: 'conjuntos' },
  MENOS50: { code: 'MENOS50', description: 'fijo', kind: 'fixed', value: '50', min_subtotal: '1000', category: null },
};

// Base de datos falsa: responde a las dos consultas que hace quoteCart.
function fakeDb(strings, ...values) {
  if (strings.join('?').includes('FROM products')) return PRODUCTS.filter((p) => values[0].includes(p.id));
  return PROMOS[values[0]] ? [PROMOS[values[0]]] : [];
}

const CART = [
  { productId: 1, size: 'M', quantity: 2 },
  { productId: 2, size: 'S', quantity: 1 },
  { productId: 3, quantity: 1 },
];

test('precio final aplica el descuento del producto', () => {
  assert.equal(unitPrice({ price: '499.99', discount_percent: 20 }), 399.99);
  assert.equal(unitPrice({ price: '89.00', discount_percent: 0 }), 89);
});

test('carrito sin código usa precios de la base', async () => {
  const quote = await quoteCart(CART, '', fakeDb);
  assert.equal(quote.subtotal, 721.2);
  assert.equal(quote.total, 721.2);
});

test('código porcentual en toda la tienda', async () => {
  const quote = await quoteCart(CART, 'app10', fakeDb);
  assert.equal(quote.discount, 72.12);
  assert.equal(quote.total, 649.08);
  assert.equal(quote.promotion.code, 'APP10');
});

test('código por categoría solo descuenta esa categoría', async () => {
  const quote = await quoteCart(CART, 'LOOKS15', fakeDb);
  assert.equal(quote.discount, 45.48);
});

test('compra mínima, categoría ausente y código falso dan error sin descuento', async () => {
  for (const [items, code] of [[CART, 'MENOS50'], [[CART[0]], 'LOOKS15'], [CART, 'NOPE']]) {
    const quote = await quoteCart(items, code, fakeDb);
    assert.ok(quote.error);
    assert.equal(quote.discount, 0);
  }
});

test('rechaza tallas, cantidades y productos inválidos', async () => {
  for (const items of [
    [{ productId: 1, size: 'XL', quantity: 1 }],
    [{ productId: 1, quantity: 1 }],
    [{ productId: 3, quantity: 0 }],
    [{ productId: 3, quantity: 21 }],
    [{ productId: 9, quantity: 1 }],
    [],
  ]) {
    const quote = await quoteCart(items, '', fakeDb);
    assert.ok(quote.error, JSON.stringify(items));
    assert.equal(quote.lines, undefined);
  }
});

test('validación de productos', () => {
  const { value } = validateProduct({ name: ' Kimono ', category: 'dormir', price: '500', discountPercent: 20, sizes: 's, m ,M', stock: 4, imageUrl: 'https://x.com/a.jpg' });
  assert.deepEqual(value.sizes, ['S', 'M']);
  assert.equal(value.name, 'Kimono');
  const bad = [
    { category: 'panties', price: 1 },
    { name: 'a', category: 'otra', price: 1 },
    { name: 'a', category: 'panties', price: 0 },
    { name: 'a', category: 'panties', price: 1, discountPercent: 95 },
    { name: 'a', category: 'panties', price: 1, imageUrl: 'javascript:alert(1)' },
  ];
  for (const body of bad) assert.ok(validateProduct(body).error, JSON.stringify(body));
});

test('validación de promociones', () => {
  assert.equal(validatePromotion({ code: 'verano-25', kind: 'percent', value: 25 }).value.code, 'VERANO-25');
  const bad = [
    { code: 'a b', kind: 'percent', value: 5 },
    { code: 'ABC', kind: 'percent', value: 95 },
    { code: 'ABC', value: 5 },
    { code: 'ABC', kind: 'fixed', value: 50, startsAt: '2026-10-05', endsAt: '2026-10-01' },
  ];
  for (const body of bad) assert.ok(validatePromotion(body).error, JSON.stringify(body));
});
