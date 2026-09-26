import { sql, ensureSchema } from '../_db.js';
import { requireAdmin } from '../_admin.js';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, product_id, comment, approved, created_at
        FROM comments
        ORDER BY approved ASC, created_at DESC
        LIMIT 200`;
      return res.status(200).json({ comments: rows });
    }

    if (req.method === 'PATCH') {
      const id = parseId(req.body?.id);
      if (!id || typeof req.body?.approved !== 'boolean') {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      await sql`UPDATE comments SET approved = ${req.body.approved} WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = parseId(req.body?.id);
      if (!id) {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      await sql`DELETE FROM comments WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin comments api error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
