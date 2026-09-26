import { sql } from '../../api/_db.js';
import { envAdminEmails, requireAdmin } from '../../api/_admin.js';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const fixedAdmins = envAdminEmails();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, email, is_admin, created_at, privacy_accepted_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 500`;
      const users = rows.map((user) => ({
        ...user,
        fixed_admin: fixedAdmins.includes(user.email),
        is_self: user.id === admin.id,
      }));
      return res.status(200).json({ users });
    }

    // Dar o quitar el rol de administradora.
    if (req.method === 'PATCH') {
      const id = parseId(req.body?.id);
      if (!id || typeof req.body?.isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      if (id === admin.id && !req.body.isAdmin) {
        return res.status(400).json({ error: 'No puedes quitarte el acceso a ti misma.' });
      }
      await sql`UPDATE users SET is_admin = ${req.body.isAdmin} WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    // Cancelación de datos (derechos ARCO): borra la cuenta y sus sesiones.
    if (req.method === 'DELETE') {
      const id = parseId(req.body?.id);
      if (!id) {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      if (id === admin.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta desde el panel.' });
      }
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin users error', error);
    return res.status(500).json({ error: 'No se pudo conectar con la base de datos.' });
  }
}
