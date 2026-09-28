import { waitUntil } from '@vercel/functions';
import { ensureUsersSchema, sql } from './_db.js';
import { clientIp, isLimited, recordAttempt } from './_ratelimit.js';
import {
  agentConfigured, ensureWhatsappSchema, isOwnEcho, isOwnerChat, parseIncoming, recentMessages, recordOutgoing, sendWhatsappText,
  setMode, setOutgoingId, storeMessage, upsertConversation, webhookAuthorized,
} from './_whatsapp.js';
import { runAgent } from './_agent.js';

const MEDIA_REPLY = 'Por ahora solo puedo leer mensajes de texto 🙏 ¿Me lo escribes? Si prefieres, te paso con una asesora del equipo.';
const HANDOFF_REPLY = 'Te comunico con una asesora del equipo SAMÉA; te escribirá por este mismo chat lo antes posible. 💕';
const ERROR_REPLY = 'Perdona, tuve un problema para responderte. Una asesora del equipo te escribirá en breve.';

async function reply(jid, text) {
  const rowId = await recordOutgoing(jid, 'bot', text);
  const id = await sendWhatsappText(jid, text);
  await setOutgoingId(rowId, id);
}

// Mensaje salido del teléfono de la tienda: si no es eco del sistema, una
// persona del equipo está atendiendo y el bot se pausa en ese chat.
async function handleOwnMessage(message) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const content = message.text || `[${message.media}]`;
    if (await isOwnEcho(message.jid, message.id, content)) return;
    const stored = await storeMessage(message.jid, 'staff', content, message.id);
    if (stored) await setMode(message.jid, 'human', 'Atendido desde el teléfono');
  } catch (error) {
    console.error('whatsapp own message error', error.message);
  }
}

async function notifyOwner(conversation, reason) {
  const owner = process.env.WHATSAPP_OWNER_NUMBER;
  if (!owner) return;
  try {
    await sendWhatsappText(owner, `🔔 SAMÉA: ${conversation.name || conversation.phone || 'Una clienta'} necesita atención.\nMotivo: ${reason}\nResponde desde el panel: ${(process.env.SITE_URL || 'https://samea.shop')}/dashboard#whatsapp`);
  } catch (error) {
    console.error('owner notify error', error.message);
  }
}

// Genera y envía la respuesta del agente (en segundo plano).
async function handleCustomerMessage(message) {
  try {
    const rows = await sql`SELECT * FROM wa_conversations WHERE jid = ${message.jid}`;
    const conversation = rows[0];
    if (!conversation || conversation.mode === 'human') return;

    if (message.media) {
      await reply(message.jid, MEDIA_REPLY);
      return;
    }

    // Límite por conversación para contener abusos y costos.
    const key = `wa:${message.jid}`;
    if (await isLimited([{ key, limit: 30, minutes: 60 }])) {
      await setMode(message.jid, 'human', 'Demasiados mensajes en una hora');
      await reply(message.jid, HANDOFF_REPLY);
      return;
    }
    await recordAttempt(key);

    const history = await recentMessages(message.jid, 20);
    const result = await runAgent(history, { phone: message.phone });
    if (result.reply) await reply(message.jid, result.reply);
    if (result.handoff) {
      await setMode(message.jid, 'human', result.handoff);
      if (!result.reply) await reply(message.jid, HANDOFF_REPLY);
      await notifyOwner(conversation, result.handoff);
    }
  } catch (error) {
    console.error('whatsapp agent error', error);
    try {
      await setMode(message.jid, 'human', 'Error del asistente automático');
      await reply(message.jid, ERROR_REPLY);
    } catch (sendError) {
      console.error('whatsapp fallback send error', sendError.message);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!webhookAuthorized(req.query?.token)) {
    console.warn('whatsapp webhook rechazado', clientIp(req));
    return res.status(401).json({ error: 'No autorizado.' });
  }
  if (!agentConfigured()) return res.status(503).json({ error: 'WhatsApp no configurado.' });

  try {
    const message = parseIncoming(req.body);
    if (!message || (!message.text && !message.media) || isOwnerChat(message)) return res.status(200).json({ ok: true, ignored: true });

    await Promise.all([ensureUsersSchema(), ensureWhatsappSchema()]);

    if (message.fromMe) {
      await upsertConversation({ ...message, name: '' });
      waitUntil(handleOwnMessage(message));
      return res.status(200).json({ ok: true });
    }

    await upsertConversation(message);
    const isNew = await storeMessage(message.jid, 'customer', message.text || `[${message.media}]`, message.id);
    if (!isNew) return res.status(200).json({ ok: true, duplicate: true });

    waitUntil(handleCustomerMessage(message));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('whatsapp webhook error', error);
    return res.status(500).json({ error: 'Error procesando el mensaje.' });
  }
}
