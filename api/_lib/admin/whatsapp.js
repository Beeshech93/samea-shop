import { sql } from '../../_db.js';
import { requireAdmin } from '../../_admin.js';
import {
  agentConfigured, connectionState, ensureWhatsappSchema, evolutionConfigured, logoutInstance, recordOutgoing,
  sendWhatsappText, setMode, setOutgoingId, setupInstance,
} from '../../_whatsapp.js';

const validJid = (value) => typeof value === 'string' && /^[0-9A-Za-z._:-]+@(s\.whatsapp\.net|lid)$/.test(value);

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureWhatsappSchema();

    // Conexión del número (instancia de Evolution API).
    if (req.method === 'GET' && req.query?.view === 'connection') {
      if (!evolutionConfigured()) return res.status(200).json({ state: 'not_configured' });
      try {
        return res.status(200).json({ state: await connectionState() });
      } catch (error) {
        console.error('evolution state error', error.message);
        return res.status(200).json({ state: 'unreachable' });
      }
    }
    if (req.method === 'POST' && ['connect', 'logout'].includes(req.body?.action)) {
      if (!evolutionConfigured()) return res.status(503).json({ error: 'Faltan las variables de Evolution API en Vercel.' });
      if (!process.env.WHATSAPP_WEBHOOK_SECRET) return res.status(503).json({ error: 'Falta WHATSAPP_WEBHOOK_SECRET en Vercel.' });
      try {
        if (req.body.action === 'logout') {
          await logoutInstance();
          return res.status(200).json({ state: 'close' });
        }
        return res.status(200).json(await setupInstance(process.env.SITE_URL || 'https://samea.shop'));
      } catch (error) {
        console.error('evolution setup error', error.message);
        return res.status(502).json({ error: `${error.message}. Revisa la URL y la API key de Evolution.` });
      }
    }

    if (req.method === 'GET') {
      const jid = req.query?.jid;
      if (jid) {
        if (!validJid(jid)) return res.status(400).json({ error: 'Conversación no válida.' });
        const messages = await sql`
          SELECT role, content, created_at FROM wa_messages WHERE jid = ${jid}
          ORDER BY created_at DESC, id DESC LIMIT 100`;
        await sql`UPDATE wa_conversations SET unread = 0 WHERE jid = ${jid}`;
        return res.status(200).json({ messages: messages.reverse() });
      }
      const conversations = await sql`
        SELECT c.jid, c.phone, c.name, c.mode, c.handoff_reason, c.unread, c.last_message_at,
          (SELECT content FROM wa_messages m WHERE m.jid = c.jid ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message
        FROM wa_conversations c ORDER BY c.last_message_at DESC LIMIT 200`;
      return res.status(200).json({
        conversations,
        status: {
          evolution: evolutionConfigured(),
          agent: agentConfigured(),
          webhookSecret: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
          ownerNumber: Boolean(process.env.WHATSAPP_OWNER_NUMBER),
        },
      });
    }

    const jid = req.body?.jid;
    if (!validJid(jid)) return res.status(400).json({ error: 'Conversación no válida.' });

    // Respuesta de una persona del equipo: se envía y el bot queda en pausa en ese chat.
    if (req.method === 'POST') {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 4000) : '';
      if (!text) return res.status(400).json({ error: 'Escribe un mensaje.' });
      if (!evolutionConfigured()) return res.status(503).json({ error: 'Evolution API no está configurada.' });
      const rowId = await recordOutgoing(jid, 'staff', text);
      try {
        const id = await sendWhatsappText(jid, text);
        await setOutgoingId(rowId, id);
      } catch (error) {
        await sql`DELETE FROM wa_messages WHERE id = ${rowId}`;
        console.error('whatsapp staff send error', error.message);
        return res.status(502).json({ error: 'WhatsApp no aceptó el mensaje. Revisa que la instancia de Evolution API esté conectada.' });
      }
      await setMode(jid, 'human', 'Atendido desde el panel');
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const mode = req.body?.mode;
      if (!['bot', 'human'].includes(mode)) return res.status(400).json({ error: 'Modo no válido.' });
      await setMode(jid, mode, mode === 'human' ? 'Pausado desde el panel' : '');
      return res.status(200).json({ ok: true });
    }

    // Borrar una conversación (derechos ARCO).
    if (req.method === 'DELETE') {
      await sql`DELETE FROM wa_conversations WHERE jid = ${jid}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin whatsapp error', error);
    return res.status(500).json({ error: 'No se pudo completar la operación de WhatsApp.' });
  }
}
