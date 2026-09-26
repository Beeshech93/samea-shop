import { sql, ensureNewsletterSchema } from '../../_db.js';
import { requireAdmin } from '../../_admin.js';

export default async function handler(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureNewsletterSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 2000`;
      return res.status(200).json({ subscribers: rows });
    }

    // Baja a petición de la persona suscrita.
    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Datos inválidos.' });
      await sql`DELETE FROM newsletter_subscribers WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin subscribers error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
