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

const { splitIntoBubbles, typingDelay } = await import('../api/_whatsapp.js');
const { conversationContext } = await import('../api/_agent.js');

test('parte la respuesta en burbujas cortas', () => {
  assert.deepEqual(splitIntoBubbles('Hola\n\n¿Qué talla usas?'), ['Hola', '¿Qué talla usas?']);
  assert.equal(splitIntoBubbles('a\n\nb\n\nc\n\nd\n\ne\n\nf').length, 4);
  assert.deepEqual(splitIntoBubbles(''), []);
});

test('el tiempo de escribiendo depende del largo', () => {
  assert.equal(typingDelay('ok'), 1200);
  assert.ok(typingDelay('x'.repeat(100)) > typingDelay('x'.repeat(20)));
  assert.equal(typingDelay('x'.repeat(5000)), 4500);
});

test('contexto con hora de México y nombre limpio', () => {
  const text = conversationContext({ name: 'Ana <script>' }, new Date('2026-09-28T18:00:00Z'));
  assert.match(text, /Hora en México/);
  assert.match(text, /"Ana script"/);
  assert.doesNotMatch(conversationContext({}), /Nombre/);
});

process.env.EVOLUTION_API_URL ||= '';
const { phoneToJid, cartLinkFromItems, withinSendingHours, reminderText } = await import('../api/_reminders.js');

test('convierte teléfonos de México en chats de WhatsApp', () => {
  assert.equal(phoneToJid('55 1234 5678'), '525512345678@s.whatsapp.net');
  assert.equal(phoneToJid('+52 1 55 1234 5678'), '525512345678@s.whatsapp.net');
  assert.equal(phoneToJid('+52 55 1234 5678'), '525512345678@s.whatsapp.net');
  assert.equal(phoneToJid('123'), null);
});

test('rehace el enlace del carrito desde el pedido', () => {
  const link = cartLinkFromItems([{ productId: 3, size: '34B', quantity: 2 }, { productId: 7, size: null, quantity: 1 }], 'APP10');
  const url = new URL(link);
  assert.equal(url.searchParams.get('carrito'), '3:34B:2,7::1');
  assert.equal(url.searchParams.get('codigo'), 'APP10');
});

test('solo envía en horario de 9 a 21 en México', () => {
  assert.equal(withinSendingHours(new Date('2026-09-28T17:00:00Z')), true); // 11:00
  assert.equal(withinSendingHours(new Date('2026-09-28T05:00:00Z')), false); // 23:00
});

test('mensajes de recordatorio', () => {
  assert.match(reminderText('card', { name: 'Ana', summary: 'Bralette', link: 'https://samea.shop/?carrito=1::1' }), /carrito=1::1/);
  const transfer = reminderText('transfer', { name: '', code: 'SAM-1001', total: '$500.00', bank: 'BBVA 123' });
  assert.match(transfer, /SAM-1001/);
  assert.match(transfer, /BBVA 123/);
});

const { normalizeSupportNumber } = await import('../api/_whatsapp.js');

test('normaliza el número de atención', () => {
  assert.equal(normalizeSupportNumber('55 1234 5678'), '525512345678');
  assert.equal(normalizeSupportNumber('+52 1 55 1234 5678'), '525512345678');
  assert.equal(normalizeSupportNumber('+1 (305) 555-0100'), '13055550100');
  assert.equal(normalizeSupportNumber(''), '');
  assert.equal(normalizeSupportNumber('123'), null);
});

const { stripEmoji } = await import('../api/_whatsapp.js');

test('las respuestas se envían sin emojis', () => {
  assert.equal(stripEmoji('Hola 😊 ¿qué talla usas? 💕✨'), 'Hola ¿qué talla usas?');
  assert.equal(stripEmoji('Listo 👍🏽.'), 'Listo.');
  assert.equal(stripEmoji('*Bralette* · $499 MXN\nTallas: CH, M'), '*Bralette* · $499 MXN\nTallas: CH, M');
  assert.deepEqual(splitIntoBubbles('Hola 😊\n\n🎉'), ['Hola']);
});
