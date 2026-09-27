import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost, isSameOrigin, siteOrigin } from '../api/_security.js';

test('solo los dominios de la tienda son de confianza', () => {
  for (const host of ['samea.shop', 'www.samea.shop', 'samea-shop.vercel.app', 'samea-shop-abc123-wishebee.vercel.app']) {
    assert.equal(isAllowedHost(host), true, host);
  }
  for (const host of ['malo.com', 'samea.shop.malo.com', 'otra-wishebee.vercel.app', '', undefined]) {
    assert.equal(isAllowedHost(host), false, String(host));
  }
});

test('los enlaces de vuelta nunca apuntan a un dominio ajeno', () => {
  process.env.SITE_URL = 'https://samea.shop';
  assert.equal(siteOrigin({ headers: { host: 'www.samea.shop' } }), 'https://www.samea.shop');
  assert.equal(siteOrigin({ headers: { host: 'malo.com', 'x-forwarded-host': 'malo.com' } }), 'https://samea.shop');
  assert.equal(siteOrigin({ headers: {} }), 'https://samea.shop');
});

test('comprobación de origen para escrituras', () => {
  assert.equal(isSameOrigin({ headers: { host: 'samea.shop', origin: 'https://samea.shop' } }), true);
  assert.equal(isSameOrigin({ headers: { host: 'samea.shop', origin: 'https://malo.com' } }), false);
  assert.equal(isSameOrigin({ headers: { host: 'samea.shop' } }), false);
  assert.equal(isSameOrigin({ headers: { host: 'samea.shop', origin: 'no es url' } }), false);
});
