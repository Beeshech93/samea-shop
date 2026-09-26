import { sql, ensureUsersSchema } from '../../_db.js';
import { createPasswordReset } from '../../_auth.js';
import { escapeHtml, mailConfigured, sendMail } from '../../_mail.js';
import { clientIp, isLimited, recordAttempt, tooMany } from '../../_ratelimit.js';

const SITE_URL = (process.env.SITE_URL || 'https://samea-shop.vercel.app').replace(/\/$/, '');
const GENERIC_REPLY = 'Si el correo está registrado, te enviamos un enlace para cambiar tu contraseña.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!mailConfigured()) {
    return res.status(503).json({ error: 'La recuperación de contraseña aún no está disponible.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254) {
    return res.status(400).json({ error: 'Escribe tu correo electrónico.' });
  }

  try {
    await ensureUsersSchema();

    const emailKey = `forgot:email:${email}`;
    const ipKey = `forgot:ip:${clientIp(req)}`;
    if (await isLimited([
      { key: emailKey, limit: 3, minutes: 60 },
      { key: ipKey, limit: 10, minutes: 60 },
    ])) {
      return tooMany(res, 60);
    }
    await recordAttempt(emailKey, ipKey);

    const rows = await sql`SELECT id, name FROM users WHERE email = ${email}`;
    const user = rows[0];
    if (user) {
      const token = await createPasswordReset(user.id);
      const link = `${SITE_URL}/?reset=${encodeURIComponent(token)}`;
      await sendMail({
        to: email,
        subject: 'Cambia tu contraseña de SAMÉA',
        text: `Hola ${user.name}:\n\nPara elegir una nueva contraseña abre este enlace (válido 1 hora):\n${link}\n\nSi no lo pediste, ignora este correo.\n\nSAMÉA`,
        html: `<p>Hola ${escapeHtml(user.name)}:</p>
<p>Para elegir una nueva contraseña pulsa el botón. El enlace es válido durante 1 hora.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background:#2b2226;color:#fff;text-decoration:none;border-radius:4px">Cambiar contraseña</a></p>
<p>Si no lo pediste, ignora este correo: tu contraseña no cambiará.</p>
<p>SAMÉA · Lencería fina</p>`,
      });
    }

    // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
    return res.status(200).json({ ok: true, message: GENERIC_REPLY });
  } catch (error) {
    console.error('forgot error', error);
    return res.status(500).json({ error: 'No se pudo enviar el correo. Inténtalo más tarde.' });
  }
}
