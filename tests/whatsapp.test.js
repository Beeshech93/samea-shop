import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
const W = await import('../api/_whatsapp.js');
const { matchState, toApiMessages } = await import('../api/_agent.js');
const { default: webhook } = await import('../api/whatsapp.js');

const upsert = (data) => ({ event: 'messages.upsert', instance: 'samea', data });

test('el webhook exige el secreto', async () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = 'secreto-largo';
  assert.equal(W.webhookAuthorized('secreto-largo'), true);
  assert.equal(W.webhookAuthorized('otro'), false);
  assert.equal(W.webhookAuthorized(undefined), false);
  const res = { statusCode: 0 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = () => res;
  res.setHeader = () => {};
  await webhook({ method: 'POST', query: { token: 'malo' }, headers: {}, body: upsert({}) }, res);
  assert.equal(res.statusCode, 401);
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  assert.equal(W.webhookAuthorized('cualquiera'), false);
});

test('lee mensajes de texto de Evolution API', () => {
  const msg = W.parseIncoming(upsert({
    key: { remoteJid: '5215512345678@s.whatsapp.net', fromMe: false, id: 'ABC' },
    pushName: 'Ana', message: { conversation: '  Hola, ¿tienen talla M?  ' },
  }));
  assert.deepEqual(msg, { jid: '5215512345678@s.whatsapp.net', phone: '5215512345678', fromMe: false, id: 'ABC', name: 'Ana', text: 'Hola, ¿tienen talla M?', media: null });
  const extended = W.parseIncoming({ event: 'MESSAGES_UPSERT', data: { key: { remoteJid: '521@s.whatsapp.net', id: 'X' }, message: { extendedTextMessage: { text: 'link' } } } });
  assert.equal(extended.text, 'link');
});

test('direcciones @lid usan el teléfono real', () => {
  const msg = W.parseIncoming(upsert({ key: { remoteJid: '123456@lid', senderPn: '5213312345678@s.whatsapp.net', id: 'L' }, message: { conversation: 'hola' } }));
  assert.equal(msg.jid, '123456@lid');
  assert.equal(msg.phone, '5213312345678');
});

test('ignora grupos, estados y otros eventos; detecta multimedia', () => {
  assert.equal(W.parseIncoming(upsert({ key: { remoteJid: '1203@g.us' }, message: { conversation: 'x' } })), null);
  assert.equal(W.parseIncoming(upsert({ key: { remoteJid: 'status@broadcast' }, message: { conversation: 'x' } })), null);
  assert.equal(W.parseIncoming({ event: 'connection.update', data: {} }), null);
  const audio = W.parseIncoming(upsert({ key: { remoteJid: '521@s.whatsapp.net', id: 'A' }, message: { audioMessage: {} } }));
  assert.equal(audio.media, 'audio');
  assert.equal(audio.text, '');
});

test('chat de la dueña', () => {
  process.env.WHATSAPP_OWNER_NUMBER = '+52 1 55 1234 5678';
  assert.equal(W.isOwnerChat({ phone: '5215512345678' }), true);
  assert.equal(W.isOwnerChat({ phone: '5213300000000' }), false);
  delete process.env.WHATSAPP_OWNER_NUMBER;
  assert.equal(W.isOwnerChat({ phone: '5215512345678' }), false);
});

test('reconoce estados con abreviaturas y sin acentos', () => {
  assert.equal(matchState('cdmx'), 'Ciudad de México');
  assert.equal(matchState('Edomex'), 'Estado de México');
  assert.equal(matchState('queretaro'), 'Querétaro');
  assert.equal(matchState('nuevo leon'), 'Nuevo León');
  assert.equal(matchState('Texas'), null);
});

test('historial para la IA: une turnos y marca respuestas del equipo', () => {
  const messages = toApiMessages([
    { role: 'bot', content: 'Mensaje previo sin clienta' },
    { role: 'customer', content: 'Hola' },
    { role: 'customer', content: '¿Tallas?' },
    { role: 'bot', content: 'CH a EG' },
    { role: 'staff', content: 'Te ayudo yo' },
    { role: 'customer', content: 'Gracias' },
  ]);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'Hola\n¿Tallas?');
  assert.equal(messages[1].role, 'assistant');
  assert.match(messages[1].content, /\[Respuesta del equipo SAMÉA\] Te ayudo yo/);
  assert.equal(messages.at(-1).content, 'Gracias');
});

test('el webhook acepta el secreto en la cabecera x-webhook-token', async () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = 'secreto-cabecera';
  const res = { statusCode: 0 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = () => res;
  res.setHeader = () => {};
  // Autorizado pero sin Evolution configurado: pasa el filtro y responde 503.
  await webhook({ method: 'POST', query: {}, headers: { 'x-webhook-token': 'secreto-cabecera' }, body: {} }, res);
  assert.equal(res.statusCode, 503);
  await webhook({ method: 'POST', query: {}, headers: { 'x-webhook-token': 'otro' }, body: {} }, res);
  assert.equal(res.statusCode, 401);
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
});

test('detecta una EVOLUTION_API_URL que no es una dirección', () => {
  for (const [value, ok] of [['400', false], ['samea', false], ['https://evolution-x.up.railway.app/', true], ['http://1.2.3.4:8080', true], ['ftp://x.com', false], ['', false]]) {
    process.env.EVOLUTION_API_URL = value;
    assert.equal(Boolean(W.evolutionBaseUrl()), ok, value);
  }
  process.env.EVOLUTION_API_URL = 'https://evolution-x.up.railway.app/';
  assert.equal(W.evolutionBaseUrl(), 'https://evolution-x.up.railway.app');
  delete process.env.EVOLUTION_API_URL;
});
