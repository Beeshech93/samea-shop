import { ensureUsersSchema } from '../_db.js';
import { destroySession } from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    await ensureUsersSchema();
    await destroySession(req, res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('logout error', error);
    return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
  }
}
