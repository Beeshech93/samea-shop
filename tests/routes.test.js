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
  for (const resource of ['comments', 'users', 'products', 'promotions', 'subscribers']) {
    const res = await call(admin, { method: 'PATCH', query: { resource }, headers: { host: 'samea.shop', origin: 'https://malo.com' } });
    assert.equal(res.statusCode, 403, resource);
  }
});

test('el registro exige aceptar el aviso de privacidad', async () => {
  const res = await call(auth, { method: 'POST', query: { action: 'register' }, body: { name: 'Ana', email: 'a@b.co', password: '12345678' } });
  assert.equal(res.statusCode, 400);
});
