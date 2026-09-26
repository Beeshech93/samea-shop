import { sql, ensureUsersSchema } from '../../api/_db.js';
import { createSession, hashPassword } from '../../api/_auth.js';
import { clearAttempts, clientIp, isLimited, recordAttempt, tooMany } from '../../api/_ratelimit.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'Escribe tu nombre (máximo 80 caracteres).' });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
  }
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (body.privacyAccepted !== true) {
    return res.status(400).json({ error: 'Debes aceptar el aviso de privacidad.' });
  }

  try {
    await ensureUsersSchema();

    const ipKey = `register:ip:${clientIp(req)}`;
    if (await isLimited([{ key: ipKey, limit: 10, minutes: 60 }])) {
      return tooMany(res, 60);
    }
    await recordAttempt(ipKey);
    const passwordHash = await hashPassword(password);
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, privacy_accepted_at)
      VALUES (${name}, ${email}, ${passwordHash}, now())
      RETURNING id, name, email`;
    // Los intentos fallidos previos a crear la cuenta no deben bloquearla.
    await clearAttempts(`login:email:${email}`);
    await createSession(res, rows[0].id);
    return res.status(201).json({ user: { name: rows[0].name, email: rows[0].email } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('register error', error);
    return res.status(500).json({ error: 'No se pudo crear la cuenta. Inténtalo más tarde.' });
  }
}
