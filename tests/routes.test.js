import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
const { default: auth } = await import('../api/auth/[action].js');
const { default: admin } = await import('../api/admin/[resource].js');

function call(handler, req) {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  return Promise.resolve(handler({ headers: {}, body: {}, query: {}, ...req }, res)).then(() => res);
}

test('rutas desconocidas responden 404', async () => {
  assert.equal((await call(auth, { method: 'POST', query: { action: 'nada' } })).statusCode, 404);
  assert.equal((await call(auth, { method: 'POST', query: { action: 'toString' } })).statusCode, 404);
  assert.equal((await call(admin, { method: 'GET', query: { resource: 'nada' } })).statusCode, 404);
});

test('las rutas de administración rechazan cambios desde otro origen', async () => {
  for (const resource of ['comments', 'users', 'products', 'promotions', 'subscribers', 'orders', 'shipping', 'payments']) {
    const res = await call(admin, { method: 'PATCH', query: { resource }, headers: { host: 'samea.shop', origin: 'https://malo.com' } });
    assert.equal(res.statusCode, 403, resource);
  }
});

const SAME = { host: 'samea.shop', origin: 'https://samea.shop' };

test('el registro exige aceptar el aviso de privacidad', async () => {
  const res = await call(auth, { method: 'POST', query: { action: 'register' }, headers: SAME, body: { name: 'Ana', email: 'a@b.co', password: '12345678' } });
  assert.equal(res.statusCode, 400);
});

test('las escrituras públicas desde otro sitio se rechazan (CSRF)', async () => {
  const { default: orders } = await import('../api/orders/[action].js');
  const { default: comments } = await import('../api/comments.js');
  const { default: newsletter } = await import('../api/newsletter.js');
  const { default: quote } = await import('../api/cart/quote.js');
  const evil = { host: 'samea.shop', origin: 'https://malo.example' };
  const cases = [
    [auth, { query: { action: 'login' } }],
    [auth, { query: { action: 'register' } }],
    [auth, { query: { action: 'logout' } }],
    [orders, { query: { action: 'create' } }],
    [orders, { query: { action: 'abandon' } }],
    [comments, {}],
    [newsletter, {}],
    [quote, {}],
  ];
  for (const [handler, req] of cases) {
    assert.equal((await call(handler, { method: 'POST', headers: evil, ...req })).statusCode, 403, JSON.stringify(req));
    assert.equal((await call(handler, { method: 'POST', headers: { host: 'samea.shop' }, ...req })).statusCode, 403, 'sin Origin');
  }
});
