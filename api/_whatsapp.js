import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from './_db.js';

// ---------- Configuración (variables de entorno en Vercel) ----------
// EVOLUTION_API_URL      p. ej. https://evolution.midominio.com
// EVOLUTION_API_KEY      clave de la instancia o global de Evolution API
// EVOLUTION_INSTANCE     nombre de la instancia conectada a tu WhatsApp
// WHATSAPP_WEBHOOK_SECRET  secreto que va en la URL del webhook (?token=...)

// Dirección del servidor de Evolution API, o null si no es una URL http(s) válida.
export function evolutionBaseUrl() {
  const raw = String(process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') ? raw : null;
  } catch {
    return null;
  }
}

export function evolutionConfigured() {
  return Boolean(evolutionBaseUrl() && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

export function agentConfigured() {
  return evolutionConfigured() && Boolean(process.env.ANTHROPIC_API_KEY);
}

let whatsappReady;
export function ensureWhatsappSchema() {
  whatsappReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS wa_conversations (
        jid TEXT PRIMARY KEY,
        phone TEXT,
        name TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'human')),
        handoff_reason TEXT NOT NULL DEFAULT '',
        unread INT NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS wa_messages (
        id BIGSERIAL PRIMARY KEY,
        jid TEXT NOT NULL REFERENCES wa_conversations(jid) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('customer', 'bot', 'staff')),
        content TEXT NOT NULL,
        wa_message_id TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS wa_messages_jid_idx ON wa_messages (jid, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS wa_cart_links (
        id BIGSERIAL PRIMARY KEY,
        jid TEXT NOT NULL REFERENCES wa_conversations(jid) ON DELETE CASCADE,
        phone TEXT,
        url TEXT NOT NULL,
        reminded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
  })().catch((error) => {
    whatsappReady = undefined;
    throw error;
  });
  return whatsappReady;
}

// Evolution API no firma las peticiones: el webhook lleva un secreto en la
// cabecera x-webhook-token (o, como alternativa, en ?token= de la URL).
export function webhookAuthorized(token) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected || typeof token !== 'string' || !token) return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(token), digest(expected));
}

function messageText(message = {}) {
  return (
    message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title
    || ''
  ).trim();
}

const MEDIA_TYPES = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage', 'locationMessage', 'contactMessage'];

// Convierte el evento MESSAGES_UPSERT de Evolution API (v2) en un mensaje simple.
// Devuelve null si no es un mensaje de chat individual que haya que atender.
export function parseIncoming(payload) {
  const event = String(payload?.event || '').toLowerCase().replace('_', '.');
  if (event !== 'messages.upsert') return null;
  const data = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const key = data?.key || {};
  const jid = String(key.remoteJid || '');
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter') || jid === 'status@broadcast') return null;

  // Número real: con direcciones @lid, WhatsApp manda el teléfono aparte.
  const candidates = key.fromMe ? [key.remoteJidAlt, jid] : [key.senderPn, key.remoteJidAlt, jid];
  const phoneJid = candidates.find((value) => typeof value === 'string' && value.endsWith('@s.whatsapp.net'));
  const phone = phoneJid ? phoneJid.split('@')[0].replace(/\D/g, '') : null;

  const text = messageText(data.message);
  const mediaType = MEDIA_TYPES.find((type) => data.message?.[type]);
  return {
    jid,
    phone,
    fromMe: Boolean(key.fromMe),
    id: key.id ? String(key.id) : null,
    name: typeof data.pushName === 'string' ? data.pushName.slice(0, 80) : '',
    text: text.slice(0, 4000),
    media: !text && mediaType ? mediaType.replace('Message', '') : null,
  };
}

// Envía un texto por Evolution API y devuelve el id del mensaje de WhatsApp.
// Con typingMs, WhatsApp muestra "escribiendo…" ese tiempo antes del mensaje.
export async function sendWhatsappText(jid, text, typingMs = 0) {
  const base = evolutionBaseUrl();
  const body = { number: jid, text: String(text).slice(0, 4000) };
  if (typingMs > 0) body.delay = Math.round(typingMs);
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Evolution API ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data?.key?.id ? String(data.key.id) : null;
}

// Palomitas azules: marca como leído el mensaje de la clienta (mejor esfuerzo).
export async function markAsRead(jid, messageId) {
  if (!messageId) return;
  try {
    await fetch(`${evolutionBaseUrl()}/chat/markMessageAsRead/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
      body: JSON.stringify({ readMessages: [{ remoteJid: jid, fromMe: false, id: messageId }] }),
    });
  } catch (error) {
    console.error('whatsapp mark read error', error.message);
  }
}

// Muestra "escribiendo…" en el chat durante delayMs (mejor esfuerzo, no bloquea).
export function showTyping(jid, delayMs = 8000) {
  fetch(`${evolutionBaseUrl()}/chat/sendPresence/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ number: jid, presence: 'composing', delay: Math.round(delayMs) }),
  }).catch((error) => console.error('whatsapp presence error', error.message));
}

// ¿Llegó otro mensaje de la clienta después de este? (para contestar todo junto)
export async function newerCustomerMessage(jid, rowId) {
  const rows = await sql`SELECT 1 FROM wa_messages WHERE jid = ${jid} AND role = 'customer' AND id > ${rowId} LIMIT 1`;
  return rows.length > 0;
}

// Chat del número de la dueña (avisos del bot): no es una clienta.
export function isOwnerChat(message) {
  const owner = String(process.env.WHATSAPP_OWNER_NUMBER || '').replace(/\D/g, '');
  return Boolean(owner) && Boolean(message.phone) && message.phone.slice(-10) === owner.slice(-10);
}

// Envía una imagen (por URL pública) con un pie de foto.
export async function sendWhatsappImage(jid, imageUrl, caption = '') {
  const base = evolutionBaseUrl();
  const response = await fetch(`${base}/message/sendMedia/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({
      number: jid,
      mediatype: 'image',
      mimetype: imageUrl.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg',
      media: imageUrl,
      caption: String(caption).slice(0, 1000),
      fileName: 'samea.jpg',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Evolution API ${response.status}`);
  return data?.key?.id ? String(data.key.id) : null;
}

export async function upsertConversation({ jid, phone, name }) {
  await sql`
    INSERT INTO wa_conversations (jid, phone, name) VALUES (${jid}, ${phone}, ${name || ''})
    ON CONFLICT (jid) DO UPDATE SET
      phone = COALESCE(EXCLUDED.phone, wa_conversations.phone),
      name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE wa_conversations.name END`;
}

// Guarda un mensaje y devuelve su id; false si ya existía (WhatsApp puede reenviar eventos).
export async function storeMessage(jid, role, content, waMessageId = null) {
  const rows = await sql`
    INSERT INTO wa_messages (jid, role, content, wa_message_id) VALUES (${jid}, ${role}, ${content}, ${waMessageId})
    ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`;
  if (!rows.length) return false;
  await sql`
    UPDATE wa_conversations SET last_message_at = now(),
      unread = CASE WHEN ${role} = 'customer' THEN unread + 1 ELSE unread END
    WHERE jid = ${jid}`;
  return rows[0].id;
}

export async function recentMessages(jid, limit = 20) {
  const rows = await sql`
    SELECT role, content, created_at FROM wa_messages WHERE jid = ${jid}
    ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
  return rows.reverse();
}

export async function setMode(jid, mode, reason = '') {
  await sql`UPDATE wa_conversations SET mode = ${mode}, handoff_reason = ${mode === 'human' ? reason : ''} WHERE jid = ${jid}`;
}

// Respuestas del bot: se guardan antes de enviarlas para reconocer su eco.
export async function recordOutgoing(jid, role, content) {
  const rows = await sql`INSERT INTO wa_messages (jid, role, content) VALUES (${jid}, ${role}, ${content}) RETURNING id`;
  await sql`UPDATE wa_conversations SET last_message_at = now(), unread = 0 WHERE jid = ${jid}`;
  return rows[0].id;
}

export async function setOutgoingId(rowId, waMessageId) {
  if (!waMessageId) return;
  await sql`UPDATE wa_messages SET wa_message_id = ${waMessageId} WHERE id = ${rowId} AND wa_message_id IS NULL`;
}

// ¿Este mensaje "enviado desde la tienda" es el eco de algo que mandó el sistema?
export async function isOwnEcho(jid, waMessageId, content) {
  const rows = await sql`
    SELECT id FROM wa_messages
    WHERE jid = ${jid} AND role IN ('bot', 'staff')
      AND (wa_message_id = ${waMessageId} OR (content = ${content} AND created_at > now() - interval '10 minutes'))
    LIMIT 1`;
  return rows.length > 0;
}

// ---------- Gestión de la instancia (desde el panel) ----------

async function evolution(method, path, body) {
  const base = evolutionBaseUrl();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

const instanceName = () => encodeURIComponent(process.env.EVOLUTION_INSTANCE);

export async function connectionState() {
  const result = await evolution('GET', `/instance/connectionState/${instanceName()}`);
  if (result.status === 404) return 'missing';
  if (!result.ok) throw new Error(`Evolution API ${result.status}`);
  return result.data?.instance?.state || result.data?.state || 'unknown';
}

// Crea la instancia si no existe, apunta su webhook a la tienda y devuelve el QR.
export async function setupInstance(siteUrl) {
  if ((await connectionState()) === 'missing') {
    const created = await evolution('POST', '/instance/create', {
      instanceName: process.env.EVOLUTION_INSTANCE,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    });
    if (!created.ok) throw new Error(`No se pudo crear la instancia (${created.status})`);
  }

  const hook = await evolution('POST', `/webhook/set/${instanceName()}`, {
    webhook: {
      enabled: true,
      url: `${siteUrl.replace(/\/$/, '')}/api/whatsapp`,
      headers: { 'x-webhook-token': process.env.WHATSAPP_WEBHOOK_SECRET },
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
  });
  if (!hook.ok) throw new Error(`No se pudo configurar el webhook (${hook.status})`);

  const state = await connectionState();
  if (state === 'open') return { state };
  const connect = await evolution('GET', `/instance/connect/${instanceName()}`);
  if (!connect.ok) throw new Error(`No se pudo generar el QR (${connect.status})`);
  return { state, qr: connect.data?.base64 || null, pairingCode: connect.data?.pairingCode || null };
}

// Número de WhatsApp vinculado a la instancia (solo dígitos), o null.
export async function connectedNumber() {
  const result = await evolution('GET', `/instance/fetchInstances?instanceName=${instanceName()}`);
  if (!result.ok) return null;
  const list = Array.isArray(result.data) ? result.data : [result.data];
  const item = list.find(Boolean) || {};
  const jid = item.ownerJid || item.instance?.owner || item.owner || '';
  const digits = String(jid).split('@')[0].replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// Número de atención que se muestra en la tienda (ajuste del panel).
export function normalizeSupportNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 13 && digits.startsWith('521')) return `52${digits.slice(3)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export async function logoutInstance() {
  const result = await evolution('DELETE', `/instance/logout/${instanceName()}`);
  if (!result.ok && result.status !== 404) throw new Error(`Evolution API ${result.status}`);
}

// Parte la respuesta en burbujas cortas, como escribe una persona: separa por
// párrafos (línea en blanco) y junta lo que sobre para no mandar más de 4.
export function splitIntoBubbles(text, max = 4) {
  const parts = String(text || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= max) return parts;
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join('\n\n')];
}

// Tiempo de "escribiendo…" según el largo del mensaje (≈ 35 letras por segundo).
export function typingDelay(text) {
  return Math.min(4500, Math.max(1200, String(text || '').length * 28));
}
