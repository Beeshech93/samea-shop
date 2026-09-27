import { sql, ensureNewsletterSchema, ensureUsersSchema } from './_db.js';
import { clientIp, isLimited, recordAttempt, tooMany } from './_ratelimit.js';
import { guardWrite } from './_security.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (!guardWrite(req, res)) return undefined;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
  }

  try {
    await Promise.all([ensureUsersSchema(), ensureNewsletterSchema()]);
    const ipKey = `newsletter:ip:${clientIp(req)}`;
    if (await isLimited([{ key: ipKey, limit: 10, minutes: 60 }])) {
      return tooMany(res, 60);
    }
    await recordAttempt(ipKey);

    // Si ya estaba suscrita no se revela: la respuesta es la misma.
    await sql`INSERT INTO newsletter_subscribers (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('newsletter error', error);
    return res.status(500).json({ error: 'No se pudo completar la suscripción. Inténtalo más tarde.' });
  }
}
