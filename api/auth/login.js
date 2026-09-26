import { sql, ensureUsersSchema } from '../_db.js';
import { createSession, hashPassword, verifyPassword } from '../_auth.js';

// Hash de relleno para que el tiempo de respuesta no revele si el correo existe.
let dummyHash;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || password.length > 200) {
    return res.status(400).json({ error: 'Completa correo y contraseña.' });
  }

  try {
    await ensureUsersSchema();
    const rows = await sql`SELECT id, name, email, password_hash FROM users WHERE email = ${email}`;
    const user = rows[0];
    dummyHash ??= await hashPassword('samea-dummy-password');
    const valid = await verifyPassword(password, user ? user.password_hash : dummyHash);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    await sql`DELETE FROM sessions WHERE expires_at < now()`;
    await createSession(res, user.id);
    return res.status(200).json({ user: { name: user.name, email: user.email } });
  } catch (error) {
    console.error('login error', error);
    return res.status(500).json({ error: 'No se pudo iniciar sesión. Inténtalo más tarde.' });
  }
}
