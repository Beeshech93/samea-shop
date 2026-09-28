import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/db';
const { recomendarTalla } = await import('../api/_agent.js');

test('recomienda talla de sujetador por bajo busto y diferencia', () => {
  assert.equal(recomendarTalla({ tipo: 'sujetador', busto: 90, bajo_busto: 75 }).talla, '34B');
  assert.equal(recomendarTalla({ tipo: 'sujetador', busto: 97, bajo_busto: 80 }).talla, '36C');
});

test('recomienda panty por cadera', () => {
  assert.equal(recomendarTalla({ tipo: 'panty', cadera: 95 }).talla, 'M');
  assert.equal(recomendarTalla({ tipo: 'panty', cadera: 104 }).talla, 'G (L)');
});

test('bralette toma la talla mayor entre busto y cadera', () => {
  assert.equal(recomendarTalla({ tipo: 'bralette_body_conjunto', busto: 85, cadera: 101 }).talla, 'G (L)');
});

test('rechaza medidas fuera de rango o faltantes', () => {
  assert.ok(recomendarTalla({ tipo: 'sujetador', busto: 34, bajo_busto: 30 }).error);
  assert.ok(recomendarTalla({ tipo: 'panty' }).error);
});
