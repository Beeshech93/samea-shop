import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
const { hashPassword, verifyPassword } = await import('../api/_auth.js');
const { isAdminUser } = await import('../api/_admin.js');

test('las contraseñas se guardan con hash y se verifican', async () => {
  const stored = await hashPassword('secreto123');
  assert.match(stored, /^scrypt\$/);
  assert.ok(!stored.includes('secreto123'));
  assert.equal(await verifyPassword('secreto123', stored), true);
  assert.equal(await verifyPassword('otra', stored), false);
  assert.equal(await verifyPassword('x', 'basura'), false);
});

test('rol de administradora por columna o por ADMIN_EMAILS', () => {
  process.env.ADMIN_EMAILS = ' Duena@Samea.shop , otra@x.com';
  assert.equal(isAdminUser({ email: 'duena@samea.shop', is_admin: false }), true);
  assert.equal(isAdminUser({ email: 'z@z.com', is_admin: true }), true);
  assert.equal(isAdminUser({ email: 'z@z.com', is_admin: false }), false);
  assert.equal(isAdminUser(null), false);
});

test('reglas de contraseña', async () => {
  const { passwordProblem } = await import('../api/_auth.js');
  assert.ok(passwordProblem('1234567'));
  assert.ok(passwordProblem('12345678'));
  assert.ok(passwordProblem('Password'));
  assert.ok(passwordProblem('aaaaaaaaaa'));
  assert.ok(passwordProblem('ana.lopez2026', 'ana.lopez@x.com'));
  assert.equal(passwordProblem('Seda&Encaje-2026', 'ana@x.com'), null);
});
