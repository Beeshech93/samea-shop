import { sql, ensureUsersSchema } from '../_db.js';
import { requireAdmin } from '../_admin.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    await ensureUsersSchema();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, email, created_at, privacy_accepted_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 500`;
      return res.status(200).json({ users: rows });
    }

    // Cancelación de datos (derechos ARCO): borra la cuenta y sus sesiones.
    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin users error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
