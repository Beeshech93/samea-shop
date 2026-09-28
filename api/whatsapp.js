import { waitUntil } from '@vercel/functions';
import { ensureUsersSchema, sql } from './_db.js';
import { clientIp, isLimited, recordAttempt } from './_ratelimit.js';
import {
  agentConfigured, ensureWhatsappSchema, isOwnEcho, isOwnerChat, markAsRead, newerCustomerMessage, parseIncoming, recentMessages,
  recordOutgoing, sendWhatsappText, setMode, setOutgoingId, showTyping, splitIntoBubbles, storeMessage, typingDelay,
  upsertConversation, webhookAuthorized,
} from './_whatsapp.js';
import { runAgent } from './_agent.js';

const MEDIA_REPLY = 'Ay, por aquí no me abren los audios ni archivos 🙈\n\n¿Me lo escribes, porfa? Así te ayudo más rápido.';
const HANDOFF_REPLY = 'Déjame pasarte con alguien del equipo para que te ayude mejor.\n\nTe escriben por aquí mismo en cuanto puedan 💕';
const ERROR_REPLY = 'Perdón, se me complicó algo por aquí 😅\n\nAlguien del equipo te escribe en un ratito.';

// Tiempo que se espera por si la clienta manda varios mensajes seguidos.
const GATHER_MS = 5000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Envía la respuesta en burbujas cortas, cada una con su "escribiendo…".
async function reply(jid, text) {
  for (const bubble of splitIntoBubbles(text)) {
    const rowId = await recordOutgoing(jid, 'bot', bubble);
    const id = await sendWhatsappText(jid, bubble, typingDelay(bubble));
    await setOutgoingId(rowId, id);
  }
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
async function handleCustomerMessage(message, rowId) {
  try {
    // Como una persona: lee el mensaje y espera a que la clienta termine de escribir.
    await wait(1500);
    await markAsRead(message.jid, message.id);
    await wait(GATHER_MS - 1500);
    if (await newerCustomerMessage(message.jid, rowId)) return; // el último mensaje responde por todos

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

    showTyping(message.jid, 20000);
    const history = await recentMessages(message.jid, 20);
    const result = await runAgent(history, { phone: message.phone, jid: message.jid, name: conversation.name });
    // Si escribió algo más mientras se pensaba la respuesta, contesta el mensaje nuevo.
    if (!result.handoff && (await newerCustomerMessage(message.jid, rowId))) return;
    const fresh = await sql`SELECT mode FROM wa_conversations WHERE jid = ${message.jid}`;
    if (fresh[0]?.mode === 'human') return; // alguien del equipo tomó el chat
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
  if (!webhookAuthorized(req.headers['x-webhook-token'] || req.query?.token)) {
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
    const rowId = await storeMessage(message.jid, 'customer', message.text || `[${message.media}]`, message.id);
    if (!rowId) return res.status(200).json({ ok: true, duplicate: true });

    waitUntil(handleCustomerMessage(message, rowId));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('whatsapp webhook error', error);
    return res.status(500).json({ error: 'Error procesando el mensaje.' });
  }
}
