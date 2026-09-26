import { sql, ensureSchema } from './_db.js';

const MAX_COMMENT = 500;
const MAX_NAME = 60;

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, product_id, comment, created_at
        FROM comments
        WHERE approved
        ORDER BY created_at DESC
        LIMIT 50`;
      return res.status(200).json({ comments: rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const productId = Number.isInteger(body.productId) && body.productId > 0 ? body.productId : null;

      if (!name || name.length > MAX_NAME) {
        return res.status(400).json({ error: `El nombre debe tener entre 1 y ${MAX_NAME} caracteres.` });
      }
      if (!comment || comment.length > MAX_COMMENT) {
        return res.status(400).json({ error: `El comentario debe tener entre 1 y ${MAX_COMMENT} caracteres.` });
      }

      await sql`INSERT INTO comments (name, product_id, comment) VALUES (${name}, ${productId}, ${comment})`;
      return res.status(201).json({ ok: true, pending: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('comments api error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
