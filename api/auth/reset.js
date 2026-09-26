import { sql, ensureUsersSchema } from '../_db.js';
import { consumePasswordReset, createSession, hashPassword } from '../_auth.js';
import { clientIp, isLimited, recordAttempt, tooMany } from '../_ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!token || token.length > 200) {
    return res.status(400).json({ error: 'El enlace no es válido.' });
  }
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    await ensureUsersSchema();

    const ipKey = `reset:ip:${clientIp(req)}`;
    if (await isLimited([{ key: ipKey, limit: 10, minutes: 60 }])) {
      return tooMany(res, 60);
    }

    const userId = await consumePasswordReset(token);
    if (!userId) {
      await recordAttempt(ipKey);
      return res.status(400).json({ error: 'El enlace caducó o ya se usó. Pide uno nuevo.' });
    }

    const passwordHash = await hashPassword(password);
    const rows = await sql`
      UPDATE users SET password_hash = ${passwordHash}
      WHERE id = ${userId}
      RETURNING id, name, email`;
    // Cierra cualquier otra sesión abierta con la contraseña anterior.
    await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
    await sql`DELETE FROM auth_attempts WHERE key = ${`login:email:${rows[0].email}`}`;
    await createSession(res, userId);
    return res.status(200).json({ user: { name: rows[0].name, email: rows[0].email } });
  } catch (error) {
    console.error('reset error', error);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña. Inténtalo más tarde.' });
  }
}
