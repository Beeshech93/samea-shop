import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const MAX_LENGTH = 500;

let tableReady;
function ensureTable() {
  tableReady ??= sql`CREATE TABLE IF NOT EXISTS comments (comment TEXT)`.catch((error) => {
    tableReady = undefined;
    throw error;
  });
  return tableReady;
}

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const rows = await sql`SELECT comment FROM comments LIMIT 50`;
      return res.status(200).json({ comments: rows.map((row) => row.comment) });
    }

    if (req.method === 'POST') {
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
      if (!comment || comment.length > MAX_LENGTH) {
        return res.status(400).json({ error: `El comentario debe tener entre 1 y ${MAX_LENGTH} caracteres.` });
      }
      await sql`INSERT INTO comments (comment) VALUES (${comment})`;
      return res.status(201).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('comments api error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
