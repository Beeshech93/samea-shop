import { sql, ensureUsersSchema } from '../_db.js';
import { requireAdmin } from '../_admin.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    await ensureUsersSchema();
    const rows = await sql`
      SELECT id, name, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 500`;
    return res.status(200).json({ users: rows });
  } catch (error) {
    console.error('admin users error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
